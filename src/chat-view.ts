import './chat.css';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatCommand } from './actions';
import type { ChatContent, DashboardBridge } from './bridge';
import { createAskPanel } from './chat-ask-view';
import { completion, modelRows, namedModel, pickedModel, planSends, resumeRows, screenCommand, type CommandRow } from './chat-commands';
import { drawEntry, type DrawnEntry } from './chat-entries';
import { onEdgeLine, recall } from './chat-history';
import { createCommandMenu } from './chat-menu-view';
import { renderMarkdown } from './chat-markdown';
import { permissionTitle, type PermissionAsk } from './chat-permission';
import { statusGroups, toneOf, type ChatMeasure } from './chat-status';
import {
  applyEvent, EMPTY_TRANSCRIPT, IMAGE_TYPES, imageDataUrl, imagesFit, preferencesOf, withEarlier, working, type ChatEvent, type ChatImage,
  type ImageType, type Transcript,
} from './chat-transcript';
import type { ChatPreferences } from './chat-sessions';
import { clampIndex } from './clamp-index';
import { failureText } from './failure';
import { imageOverlay, searchOverlay } from './overlay';
import { isModified } from './shortcuts';

// The Claude screen: a conversation drawn as HTML over a prompt box, run through the Agent SDK by
// chat-sessions.ts in main. The keys it answers through the window's lookup are rows in actions.ts and
// arrive as runCommand. The prompt box reads Enter and Backspace for itself, Up and Down for the
// prompts sent before, and, while the slash command list is open over it, Up, Down, Tab and Enter
// for that.

export type ChatViewOptions = {
  bridge: DashboardBridge;
  slot: number;
  projectName: string;
  // The id the notification carries back, so a click on it lands on this screen.
  paneId: string;
  onError(message: string): void;
  onNotice(message: string): void;
};

export type ChatView = {
  element: HTMLElement;
  open(): void;
  focus(): void;
  receive(event: ChatEvent): void;
  runCommand(command: ChatCommand): void;
};

// What the model key walks. Null is whatever the session's own settings choose.
const MODELS: (string | null)[] = [null, 'opus', 'sonnet', 'haiku'];
// What the edits key walks, in the Claude Code terminal's order. A mode the session's settings start
// it in that is not here — auto, or skipping permissions — is shown, and the key walks on from the top.
const MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan'];
const MODE_LABELS: Record<PermissionMode, string> = {
  default: 'asking before edits', acceptEdits: 'accepting edits', plan: 'planning',
  auto: 'auto mode', bypassPermissions: 'skipping permissions', dontAsk: 'refusing what is not allowed',
};

const PAINT_MS = 80;

function next<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

export function createChatView(options: ChatViewOptions): ChatView {
  const { bridge, slot } = options;
  const element = document.createElement('div');
  element.className = 'chat';
  const log = document.createElement('div');
  log.className = 'chat-log';
  const live = document.createElement('div');
  live.className = 'chat-entry chat-text chat-live';
  live.hidden = true;
  log.append(live);
  const ask = createAskPanel((id, result) => {
    bridge.chatAnswer(slot, id, result);
    dropAsk(id);
  });
  const attached = document.createElement('div');
  attached.className = 'chat-attached';
  const prompt = document.createElement('textarea');
  prompt.className = 'chat-prompt';
  prompt.placeholder = 'Ask Claude. Enter sends, Shift+Enter is a new line, / lists the commands. Paste or drop an image to attach it.';
  prompt.rows = 3;
  prompt.dir = 'auto';
  const menu = createCommandMenu();
  const foot = document.createElement('div');
  foot.className = 'chat-foot';
  element.append(log, ask.element, menu.element, attached, prompt, foot);

  let transcript: Transcript = EMPTY_TRANSCRIPT;
  let drawn: DrawnEntry[] = [];
  let selected: number | null = null;
  let asks: PermissionAsk[] = [];
  let images: ChatImage[] = [];
  let model: string | null = null;
  let mode: PermissionMode = 'default';
  let measured: ChatMeasure | null = null;
  let earlierRead = false;
  // The session's slash commands, asked for the first time a slash is typed; null until they arrive.
  let commands: CommandRow[] | null = null;
  let commandsAsked = false;
  // Which sent prompt Up has brought back, and what was in the box before it did.
  let recalled: number | null = null;
  let draft = '';
  // Bumped by a new conversation, so a read of the earlier one that comes back after it is dropped.
  let resets = 0;

  // ponytail: content-visibility skips laying out what is off screen, and markdown is only rendered
  // for an entry once it comes near; every entry still has its box. Recycle boxes if a session long
  // enough to need it turns up.
  const unfilled = new Map<Element, () => void>();
  const nearScreen = new IntersectionObserver((seen) => {
    for (const each of seen) {
      if (!each.isIntersecting) continue;
      nearScreen.unobserve(each.target);
      unfilled.get(each.target)?.();
      unfilled.delete(each.target);
    }
  }, { root: log, rootMargin: '800px 0px' });

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;

  // Two lines, as under Claude Code's prompt: its status line, then the mode and what Claude is doing.
  let drawnFoot = '';
  function drawFoot(): void {
    const shown = measured?.model ?? model ?? transcript.model ?? 'default model';
    const state = [MODE_LABELS[mode], asks.length > 0 ? 'waiting on you' : transcript.busy ? 'working…' : 'ready'].join(' · ');
    // Every paint asks, a streamed token included; the foot is only rebuilt when something on it changed.
    const key = JSON.stringify([measured, shown, transcript.version, state]);
    if (key === drawnFoot) return;
    drawnFoot = key;
    const status = document.createElement('div');
    status.className = 'chat-status';
    if (measured) {
      const bar = document.createElement('span');
      bar.className = `chat-context chat-status-${toneOf(measured.context.percentage)}`;
      bar.style.setProperty('--used', `${measured.context.percentage}%`);
      status.append(bar);
    }
    statusGroups(measured, shown, transcript.version).forEach((group, index) => {
      if (index > 0) status.append(' · ');
      group.forEach((piece, at) => {
        const span = document.createElement('span');
        span.className = `chat-status-${piece.tone}`;
        span.textContent = at > 0 ? ` ${piece.text}` : piece.text;
        status.append(span);
      });
    });
    const line = document.createElement('div');
    line.textContent = state;
    foot.replaceChildren(status, line);
  }

  // The entries last drawn. A streamed token leaves them as they were, so the walk below is skipped.
  let drawnEntries: Transcript['entries'] = [];
  let painting = 0;
  let paintedLive = '';
  // Everything a change puts on screen, at most once every PAINT_MS: a token arrives far more often
  // than that, and each paint reads the layout and runs markdown over the whole streaming block.
  function render(): void {
    if (!painting) painting = window.setTimeout(paint, PAINT_MS);
  }

  function paint(): void {
    painting = 0;
    const stick = atBottom();
    if (transcript.entries !== drawnEntries) drawEntries();
    if (transcript.live !== paintedLive) {
      paintedLive = transcript.live;
      live.hidden = paintedLive === '';
      live.innerHTML = paintedLive ? renderMarkdown(paintedLive) : '';
    }
    drawFoot();
    if (stick) log.scrollTop = log.scrollHeight;
  }

  function drawEntries(): void {
    drawnEntries = transcript.entries;
    transcript.entries.forEach((entry, index) => {
      if (drawn[index]?.entry === entry) return;
      const fresh = drawEntry(entry);
      const old = drawn[index];
      if (old) {
        if (old.element instanceof HTMLDetailsElement && fresh.element instanceof HTMLDetailsElement && old.element.open) {
          fresh.element.open = true;
        }
        old.element.replaceWith(fresh.element);
      } else {
        log.insertBefore(fresh.element, live);
      }
      fresh.element.classList.toggle('selected', index === selected);
      if (fresh.fill) {
        unfilled.set(fresh.element, fresh.fill);
        nearScreen.observe(fresh.element);
      }
      drawn[index] = fresh;
    });
  }

  // Open, a turn ending and a model picked each measure, and the answers can come back out of order:
  // only the latest one asked is kept.
  let measures = 0;
  function measure(): void {
    const asked = ++measures;
    bridge.chatMeasure(slot).then((reading) => {
      if (asked !== measures) return;
      if (reading !== null) measured = reading;
      drawFoot();
    }, () => undefined);
  }

  function showAsk(): void {
    ask.show(asks[0] ?? null);
    drawFoot();
  }

  // An ask answered here or given up on in main. Only the first is ever on screen, so only its going
  // changes the box.
  function dropAsk(id: string): void {
    const wasFirst = asks[0]?.id === id;
    asks = asks.filter((each) => each.id !== id);
    if (!wasFirst) return;
    showAsk();
    if (asks.length === 0 && seen()) prompt.focus();
  }

  // On screen and in front: the screen is not under a hidden view or page, and the window has focus.
  const seen = () => document.hasFocus() && element.closest('[hidden]') === null;

  function emptyBox(): void {
    prompt.value = '';
    recalled = null;
    menu.update('', []);
  }

  function send(): void {
    let text = prompt.value.trim();
    if (!text && images.length === 0) return;
    const own = screenCommand(text);
    if (own) emptyBox();
    if (own?.kind === 'resume') return showResume();
    if (own?.kind === 'model') return showModels(own.rest);
    if (own?.kind === 'plan') {
      configure({ permissionMode: (mode = 'plan') });
      if (!planSends(own.rest, images.length)) return;
      text = own.rest;
    }
    const content: ChatContent = [
      ...images.map((picture) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: picture.mediaType as ImageType, data: picture.data },
      })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
    // Main sends the prompt back to every screen, this one included, as a `prompt` event.
    bridge.chatSend(slot, content);
    if (commands === null) commandsAsked = false;
    emptyBox();
    images = [];
    attached.replaceChildren();
    selected = null;
    log.scrollTop = log.scrollHeight;
    render();
  }

  function drawAttached(): void {
    attached.replaceChildren(...images.map((picture, index) => {
      const thumbnail = document.createElement('img');
      thumbnail.src = imageDataUrl(picture);
      thumbnail.alt = `image ${index + 1}`;
      return thumbnail;
    }));
  }

  // The list follows what is typed. The first slash asks main for the session's commands, which
  // starts the session; until they arrive the list holds the screen's own. One ask that fails is not
  // made again on every keystroke: the session that failed to start has said why, and the next
  // prompt sent tries again.
  function updateMenu(): void {
    if (prompt.value.startsWith('/') && !commandsAsked) {
      commandsAsked = true;
      bridge.chatCommands(slot).then((list) => {
        commands = list;
        updateMenu();
      }, () => undefined);
    }
    menu.update(prompt.value, commands ?? []);
  }

  function complete(row: CommandRow, enter: boolean): void {
    const { text, runs } = completion(row, enter);
    prompt.value = text;
    if (runs) send();
    else updateMenu();
    prompt.focus();
  }
  menu.onClick((row) => complete(row, true));

  // The prompts sent in this conversation, oldest first, what Up walks back through.
  function sentPrompts(): string[] {
    return transcript.entries.flatMap((entry) => (entry.kind === 'user' && entry.text.trim() ? [entry.text] : []));
  }

  function walkHistory(direction: -1 | 1): boolean {
    if (prompt.selectionStart !== prompt.selectionEnd || !onEdgeLine(prompt.value, prompt.selectionStart, direction)) return false;
    const sent = sentPrompts();
    const moved = recall(sent.length, recalled, direction);
    if (!moved) return false;
    if (recalled === null) draft = prompt.value;
    recalled = moved.at;
    prompt.value = recalled === null ? draft : sent[recalled];
    // Not opened for a recalled command, so the next Up keeps walking the history.
    menu.update('', []);
    return true;
  }

  prompt.addEventListener('input', () => {
    recalled = null;
    updateMenu();
  });

  prompt.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    const arrow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    const menuOpen = menu.open();
    if (menuOpen && arrow !== 0) {
      event.preventDefault();
      menu.move(arrow);
    } else if (menuOpen && (event.key === 'Tab' || event.key === 'Enter')) {
      event.preventDefault();
      const row = menu.picked();
      if (row) complete(row, event.key === 'Enter');
    } else if (arrow !== 0) {
      if (walkHistory(arrow)) event.preventDefault();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      send();
    } else if (event.key === 'Backspace' && prompt.value === '' && images.length > 0) {
      images = images.slice(0, -1);
      drawAttached();
    }
  });

  // Images pasted into the box or dropped anywhere on the screen are attached to the next prompt. The
  // window cancels every drop's default, so a file dropped here never replaces the page.
  function imageFiles(list: FileList | undefined): File[] {
    return [...list ?? []].filter((file) => (IMAGE_TYPES as readonly string[]).includes(file.type));
  }

  prompt.addEventListener('paste', (event) => {
    const files = imageFiles(event.clipboardData?.files);
    if (files.length === 0) return;
    event.preventDefault();
    attach(files);
  });

  // Only a drag carrying files lights the box; text dragged out of the log is not something it takes.
  element.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) element.classList.add('dropping');
  });
  element.addEventListener('dragleave', (event) => {
    if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) element.classList.remove('dropping');
  });
  element.addEventListener('drop', (event) => {
    element.classList.remove('dropping');
    const dropped = event.dataTransfer?.files;
    const files = imageFiles(dropped);
    if (files.length === 0) {
      if (dropped?.length) options.onNotice('Only PNG, JPEG, GIF and WebP images can be attached.');
      return;
    }
    attach(files);
    prompt.focus();
  });

  function attach(files: File[]): void {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result).split(',')[1] ?? '';
        if (!imagesFit([...images.map((picture) => picture.data.length), data.length])) {
          options.onNotice('That image would put this prompt over 5 MB of images; Claude cannot take it.');
          return;
        }
        images = [...images, { mediaType: file.type, data }];
        drawAttached();
      };
      reader.readAsDataURL(file);
    }
  }

  // A link anywhere on the screen — the log, a plan in the ask box — opens in the browser, where main
  // decides what is safe to hand the system, never in this window.
  // An image, in the log or attached, opens full size over the app.
  element.addEventListener('click', (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
      imageOverlay(event.target.src);
      return;
    }
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;
    event.preventDefault();
    bridge.openExternal(link.href);
  });

  // A click on an entry moves the selection there; a tool call's own summary unfolds it, which is what
  // the unfold key does on a selected one.
  log.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('a')) return;
    const index = drawn.findIndex((entry) => entry.element.contains(target));
    if (index !== -1) select(index);
  });

  function select(index: number | null): void {
    drawn[selected ?? -1]?.element.classList.remove('selected');
    selected = index === null || drawn.length === 0 ? null : clampIndex(index, drawn.length - 1);
    if (selected === null) return;
    const chosen = drawn[selected].element;
    chosen.classList.add('selected');
    chosen.scrollIntoView({ block: 'nearest' });
  }

  function configure(change: ChatPreferences): void {
    choose(change);
    drawFoot();
    // A model picked is measured again, so the status line names it.
    bridge.chatConfigure(slot, change).then(() => {
      if ('model' in change) measure();
    }, (error: unknown) => options.onError(`Claude setting not changed: ${failureText(error)}`));
  }

  function choose(change: ChatPreferences): void {
    // A model picked here or on another screen shows over the measured name until the next measure.
    if ('model' in change && (change.model ?? null) !== model) {
      model = change.model ?? null;
      if (measured) measured = { ...measured, model: null };
    }
    if (change.permissionMode) mode = change.permissionMode;
  }

  function readEarlier(): void {
    if (earlierRead) return;
    earlierRead = true;
    const reading = resets;
    bridge.chatRead(slot).then((state) => {
      if (reading !== resets) return;
      transcript = withEarlier(transcript, state.messages);
      choose(state.preferences);
      for (const waiting of state.asks) addAsk(waiting);
      paint();
      log.scrollTop = log.scrollHeight;
    }, (error: unknown) => options.onError(`Earlier conversation not read: ${failureText(error)}`));
  }

  // A question the session is waiting on. One that is already here — told of it while the read was
  // on its way — is not added twice.
  function addAsk(waiting: PermissionAsk): void {
    if (asks.some((each) => each.id === waiting.id)) return;
    asks = [...asks, waiting];
    if (asks.length === 1) {
      showAsk();
      if (seen()) ask.focus();
    }
    if (!seen()) bridge.notify(options.projectName, `Claude is asking: ${permissionTitle(waiting)}`, options.paneId);
  }

  // The project's earlier conversations in a search sheet; the one picked is read back on every
  // screen and carried on by the next prompt.
  function showResume(): void {
    if (working(transcript, asks.length)) {
      options.onNotice('Claude is still working. Escape stops it; then pick the conversation.');
      return;
    }
    bridge.chatSessions(slot).then(async (found) => {
      if (found.sessions.length === 0) return options.onNotice('This project has no earlier conversations.');
      const picked = await searchOverlay({
        name: 'chat-resume', placeholder: 'Search conversations', rows: (query) => resumeRows(found, query),
        empty: 'No conversation matches.', glyph: () => 'claude',
      });
      if (picked !== undefined && picked !== found.current) bridge.chatResume(slot, picked);
      focus();
    }, (error: unknown) => options.onError(`Earlier conversations not listed: ${failureText(error)}`));
  }

  // The session's models in a search sheet, as Claude Code's /model lists them, or straight to the one
  // named after the command; the one chosen is what the next turn runs on, on every screen.
  function showModels(name: string): void {
    bridge.chatModels(slot).then(async (models) => {
      if (name) {
        const named = namedModel(models, name);
        if (named) configure({ model: pickedModel(named) });
        else options.onNotice(`Claude has no model named ${name}. /model lists the ones it has.`);
        return;
      }
      const picked = await searchOverlay({
        name: 'chat-model', placeholder: 'Search models', rows: (query) => modelRows(models, model ?? transcript.model, query),
        empty: 'No model matches.', glyph: () => 'claude',
      });
      if (picked !== undefined) configure({ model: pickedModel(picked) });
      focus();
    }, (error: unknown) => options.onError(`Models not listed: ${failureText(error)}`));
  }

  // A new conversation, started on this screen or another: the old one leaves the screen.
  function clear(): void {
    resets++;
    for (const entry of drawn) entry.element.remove();
    nearScreen.disconnect();
    unfilled.clear();
    transcript = EMPTY_TRANSCRIPT;
    drawn = [];
    drawnEntries = [];
    selected = null;
    asks = [];
    measured = null;
    measures++;
    recalled = null;
    draft = '';
    showAsk();
    render();
  }

  function focus(): void {
    if (asks.length > 0) ask.focus();
    else prompt.focus();
  }

  return {
    element,
    open() {
      readEarlier();
      measure();
      focus();
    },
    focus,
    receive(event) {
      if (event.kind === 'ask') return addAsk(event.ask);
      if (event.kind === 'ask-gone') return dropAsk(event.id);
      // A new conversation or one picked in /resume, from any screen: whatever the page is on now is
      // read back, which for a new one is nothing.
      if (event.kind === 'reset') {
        clear();
        earlierRead = false;
        return readEarlier();
      }
      if (event.kind === 'message' && event.message.subtype === 'commands_changed' && Array.isArray(event.message.commands)) {
        commands = event.message.commands as CommandRow[];
      }
      const change = preferencesOf(event);
      if (change) choose(change);
      transcript = applyEvent(transcript, event);
      if (event.kind === 'message' && event.message.type === 'result') measure();
      render();
    },
    runCommand(command) {
      if (command === 'select-up') select(selected === null ? drawn.length - 1 : selected - 1);
      if (command === 'select-down') select(selected === null ? null : selected + 1);
      if (command === 'unfold') {
        const chosen = drawn[selected ?? -1]?.element;
        if (chosen instanceof HTMLDetailsElement) chosen.open = !chosen.open;
      }
      // Escape closes an open command list first, as in Claude Code. Otherwise always sent: this screen
      // may not know of a turn another one started, and interrupting an idle session does nothing.
      if (command === 'interrupt' && menu.open()) menu.update('', []);
      else if (command === 'interrupt') bridge.chatInterrupt(slot);
      if (command === 'image') {
        const source = (selected === null ? attached : drawn[selected].element).querySelector('img')?.src;
        if (source) imageOverlay(source);
      }
      if (command === 'model') configure({ model: next(MODELS, model) });
      if (command === 'permission-mode') configure({ permissionMode: next(MODES, mode) });
      // Not under a running turn: the reset closes the session, and what Claude was half-way through
      // doing would stop with nothing on screen saying so.
      if (command === 'new' && working(transcript, asks.length)) {
        options.onNotice('Claude is still working. Escape stops it; then start the new conversation.');
      } else if (command === 'new') {
        // The screen clears when main's reset event comes back, as every other screen does.
        bridge.chatReset(slot);
        prompt.focus();
      }
    },
  };
}
