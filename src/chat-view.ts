import './chat.css';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatCommand } from './actions';
import type { ChatContent, DashboardBridge } from './bridge';
import { createAskPanel } from './chat-ask-view';
import { completion, droppedFiles, EFFORT_LEVELS, effortRows, fileMention, footEffort, mentionInsertion, modelRows, namedEffort, namedModel, nextCopyBlock, pickedModel, planSends, resumeRows, screenCommand, tabFill, type ChosenEffort, type CommandRow } from './chat-commands';
import { editsHeading, sessionEdits } from './chat-diff';
import { diffBlock, drawEntry, foldOf, PDF_TILE, pdfTileState, type DrawnEntry } from './chat-entries';
import { historyRows, onEdgeLine, promptHistory, recall, sentPrompts } from './chat-history';
import { createCommandMenu, type MenuRow } from './chat-menu-view';
import { fileRows, mentionAt, pickMention } from './chat-mentions';
import { renderMarkdown } from './chat-markdown';
import { permissionTitle, type PermissionAsk } from './chat-permission';
import { revealed } from './chat-reveal';
import { rewind } from './chat-rewind-view';
import { footSides, piece, type FootState } from './chat-foot-view';
import { workingLine, type ChatMeasure } from './chat-status';
import {
  applyEvent, EMPTY_TRANSCRIPT, imageDataUrl, isImageType, imagesFit, preferencesOf, withEarlier, working, type ChatEvent, type ChatImage,
  type ImageType, type Transcript,
} from './chat-transcript';
import type { ChatPreferences } from './chat-sessions';
import { createTaskStrip } from './chat-task-strip';
import { backgroundTarget, stopTarget } from './chat-tasks';
import { clampIndex } from './clamp-index';
import { failureText } from './failure';
import { imageOverlay, pdfOverlay, searchOverlay, viewerOverlay } from './overlay';
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
  // A question arrived or the last one went, so whatever marks a project that wants you redraws.
  onWaiting(): void;
};

export type ChatView = {
  element: HTMLElement;
  open(): void;
  focus(): void;
  receive(event: ChatEvent): void;
  runCommand(command: ChatCommand): void;
  // The title of the question the session is waiting on, or null. Having one is main's bell, and the
  // title is what the manager's row prints under main, as a worker's row prints its last line.
  question(): string | null;
};

// What the model key walks. Null is whatever the session's own settings choose.
const MODELS: (string | null)[] = [null, 'opus', 'sonnet', 'haiku'];
// What the edits key walks, in the Claude Code terminal's order. Auto is on it because main starts in
// it, and a walk that could not come back would leave main asking before every edit and dispatch. A
// mode that is not here, skipping permissions, is shown, and the key walks on from the top.
const MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto'];
const MODE_LABELS: Record<PermissionMode, string> = {
  default: 'asking before edits', acceptEdits: 'accepting edits', plan: 'planning',
  auto: 'auto mode', bypassPermissions: 'skipping permissions', dontAsk: 'refusing what is not allowed',
};

const PAINT_MS = 80;

function next<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

// Swapped for Claude's suggested next prompt while there is one (paint).
const PLACEHOLDER = 'Ask Claude. Enter sends, Shift+Enter is a new line, / lists the commands, @ the files. Paste or drop an image to attach it.';

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
  prompt.placeholder = PLACEHOLDER;
  prompt.rows = 3;
  prompt.dir = 'auto';
  const menu = createCommandMenu();
  const activity = document.createElement('div');
  activity.className = 'chat-working';
  activity.hidden = true;
  const activityText = document.createElement('span');
  activity.append(piece('chat-spinner', '✻'), activityText);
  const foot = document.createElement('div');
  foot.className = 'chat-foot';
  const tasks = createTaskStrip();
  element.append(log, tasks.element, activity, ask.element, menu.element, attached, prompt, foot);

  let transcript: Transcript = EMPTY_TRANSCRIPT;
  let drawn: DrawnEntry[] = [];
  let selected: number | null = null;
  // The block the copy key copied last, so the next press on the same entry copies the one after it.
  let copied: { entry: number; block: number } | null = null;
  let asks: PermissionAsk[] = [];
  let images: ChatImage[] = [];
  let model: string | null = null;
  let effort: ChosenEffort;
  // Main starts in auto mode; chat-sessions.ts seeds it so, and this agrees until the read says.
  let mode: PermissionMode = 'auto';
  let measured: ChatMeasure | null = null;
  let earlierRead = false;
  // The session's slash commands, asked for the first time a slash is typed; null until they arrive.
  let commands: CommandRow[] | null = null;
  let commandsAsked = false;
  // The project's files for the @ list, and the @ they were asked for.
  let files: string[] = [];
  let filesFor: number | null = null;
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

  // One row under the box: on the left the model, the mode and what Claude is doing; on the right
  // the meters Claude Code's status line carries, then the version.
  const turnState = (): FootState => (asks.length > 0 ? 'waiting' : transcript.busy ? 'working' : 'ready');
  let drawnFoot = '';
  function drawFoot(): void {
    const shown = measured?.model ?? model ?? transcript.model ?? 'default model';
    const state = turnState();
    // Every paint asks, a streamed token included; the foot is only rebuilt when something on it changed.
    const effortShown = footEffort(effort, state, transcript.entries);
    const key = JSON.stringify([measured, shown, transcript.version, mode, effortShown, state]);
    if (key === drawnFoot) return;
    drawnFoot = key;
    foot.replaceChildren(...footSides(shown, MODE_LABELS[mode], effortShown.label, effortShown.ultrathink, state, measured, transcript.version));
  }

  // While a turn runs, the line over the box says so and counts, as Claude Code's spinner line does.
  // It ticks once a second on its own, since a long tool call streams nothing to paint by. A question
  // hides it without stopping the turn's clock, which the transcript keeps.
  let ticking = 0;
  function drawWorking(): void {
    const started = transcript.started;
    if (turnState() !== 'working' || started === null) {
      window.clearInterval(ticking);
      ticking = 0;
      activity.hidden = true;
      return;
    }
    if (!ticking) ticking = window.setInterval(drawWorking, 1000);
    activity.hidden = false;
    activityText.textContent = workingLine(Math.floor((Date.now() - started) / 1000), transcript.streamed, transcript.thinking);
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
    const stick = pinned;
    if (transcript.entries !== drawnEntries) drawEntries();
    if (transcript.live !== paintedLive && !revealing) reveal();
    drawFoot();
    drawWorking();
    const placeholder = transcript.suggestion ?? PLACEHOLDER;
    if (prompt.placeholder !== placeholder) prompt.placeholder = placeholder;
    tasks.render(transcript.tasks);
    if (stick) log.scrollTop = log.scrollHeight;
  }

  // The streaming block catches up with what has arrived a few characters a frame (chat-reveal.ts),
  // so a burst flows in rather than landing at once.
  // Whether the log sits at its end is kept from its scroll events rather than read each frame, which
  // would force a layout right after the last frame's write.
  // ponytail: markdown runs over the whole streaming block each frame; render only the tail past the
  // last finished paragraph if a long answer ever stutters.
  let revealing = 0;
  let pinned = true;
  log.addEventListener('scroll', () => { pinned = atBottom(); }, { passive: true });
  function reveal(): void {
    revealing = 0;
    paintedLive = revealed(paintedLive, transcript.live);
    live.hidden = paintedLive === '';
    live.innerHTML = paintedLive ? renderMarkdown(paintedLive) : '';
    if (pinned) log.scrollTop = log.scrollHeight;
    if (paintedLive !== transcript.live) revealing = requestAnimationFrame(reveal);
  }

  function drawEntries(): void {
    drawnEntries = transcript.entries;
    let previousAt: number | undefined;
    transcript.entries.forEach((entry, index) => {
      const before = previousAt;
      if ('at' in entry && entry.at !== undefined) previousAt = entry.at;
      if (drawn[index]?.entry === entry) return;
      const fresh = drawEntry(entry, before);
      const old = drawn[index];
      if (old) {
        const freshFold = foldOf(fresh.element);
        if (freshFold && foldOf(old.element)?.open) freshFold.open = true;
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
    // A question hides the working line and its going brings it back, still counting from the turn's start.
    drawWorking();
    options.onWaiting();
  }

  // An ask answered here or given up on in main. Only the first is ever on screen, so only its going
  // changes the box.
  function dropAsk(id: string): void {
    const wasFirst = asks[0]?.id === id;
    asks = asks.filter((each) => each.id !== id);
    if (!wasFirst) return;
    // Asked before the panel hides, which drops the keyboard out of the screen.
    const hadKeyboard = holdsKeyboard();
    showAsk();
    if (asks.length === 0 && hadKeyboard) prompt.focus();
  }

  // On screen and in front: the screen is not under a hidden view or page, and the window has focus.
  // Decides the banner only: main sits beside the workers, so it is seen while a worker has the keyboard.
  const seen = () => document.hasFocus() && element.closest('[hidden]') === null;
  // Whether main has the keyboard. Only then does a question take it, so a line half-typed into a
  // worker never ends in an Enter that answers main's question for you.
  const holdsKeyboard = () => element.contains(document.activeElement);

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
    if (own?.kind === 'diff') return showDiff();
    if (own?.kind === 'rewind') return showRewind();
    if (own?.kind === 'model') return showModels(own.rest);
    if (own?.kind === 'effort') return showEfforts(own.rest);
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
    // Each new @ asks for the files again, so one made since the last is in the list.
    const mention = mentionAt(prompt.value, prompt.selectionStart);
    if (mention && mention.start !== filesFor) {
      bridge.chatFiles(slot).then((list) => {
        files = list;
        updateMenu();
      }, () => undefined);
    }
    filesFor = mention?.start ?? null;
    menu.update(prompt.value, commands ?? [], mention ? fileRows(files, mention.query) : undefined);
  }

  function complete(row: MenuRow, enter: boolean): void {
    if (typeof row === 'string') {
      const picked = pickMention(prompt.value, prompt.selectionStart, row);
      prompt.value = picked.text;
      prompt.setSelectionRange(picked.caret, picked.caret);
      updateMenu();
      prompt.focus();
      return;
    }
    const { text, runs } = completion(row, enter);
    prompt.value = text;
    if (runs) send();
    else updateMenu();
    prompt.focus();
  }
  menu.onClick((row) => complete(row, true));

  // Tab. The window's lookup takes it before the box does, so the command list's Tab arrives here too;
  // the box's own Tab branch is for when this key is bound elsewhere. Only the prompt box takes the
  // suggestion, not a question's answer box that has the keyboard.
  function acceptSuggestion(): void {
    const fill = tabFill(menu.open() ? menu.picked() : null, prompt.value, transcript.suggestion);
    if (fill?.kind === 'command') return complete(fill.row, false);
    if (!fill || document.activeElement !== prompt) return;
    prompt.value = fill.text;
    prompt.dispatchEvent(new Event('input'));
  }

  function walkHistory(direction: -1 | 1): boolean {
    if (prompt.selectionStart !== prompt.selectionEnd || !onEdgeLine(prompt.value, prompt.selectionStart, direction)) return false;
    const sent = sentPrompts(transcript.entries);
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
  // The @ list follows the caret, so moving it without typing redraws the list too: a
  // click, or any key that moved the caret (macOS Ctrl+A, E and F included). A recalled
  // prompt stays closed until it is edited, so the next Up keeps walking the history.
  let caretAtKeydown: number | null = null;
  prompt.addEventListener('click', () => {
    if (recalled === null) updateMenu();
  });
  prompt.addEventListener('keydown', () => {
    caretAtKeydown = prompt.selectionStart;
  });
  prompt.addEventListener('keyup', () => {
    if (recalled === null && prompt.selectionStart !== caretAtKeydown) updateMenu();
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
  prompt.addEventListener('paste', (event) => {
    const files = [...event.clipboardData?.files ?? []].filter((file) => isImageType(file.type));
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
    const dropped = [...event.dataTransfer?.files ?? []];
    if (dropped.length === 0) return;
    const { pictures, paths, refused } = droppedFiles(dropped.map((file) => ({ file, type: file.type, path: bridge.getPathForFile(file) })));
    if (pictures.length > 0) attach(pictures.map((each) => each.file));
    if (paths.length > 0) {
      const insertion = mentionInsertion(prompt.value.slice(0, prompt.selectionStart), paths.map(fileMention));
      prompt.setRangeText(insertion, prompt.selectionStart, prompt.selectionEnd, 'end');
      // setRangeText fires no input event; the box's own handler forgets a recalled prompt and refreshes the command list.
      prompt.dispatchEvent(new Event('input'));
    }
    if (refused) options.onNotice('Only PNG, JPEG, GIF, WEBP images or files on disk can be dropped here.');
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
  // An image, in the log or attached, opens full size over the app, and a PDF's tile in the viewer.
  element.addEventListener('click', (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
      imageOverlay(event.target.src);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const tile = target?.closest<HTMLElement>(`.${PDF_TILE}`);
    if (tile) {
      openPdf(tile);
      return;
    }
    const link = target?.closest('a');
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

  // Main reads the file each time, so a PDF written since the tile was drawn opens as it is now. One
  // it will not hand over says why on the tile, which stays, until a later click opens it.
  function openPdf(tile: HTMLElement): void {
    bridge.readPdf(slot, tile.dataset.path ?? '').then(async (answer) => {
      pdfTileState(tile, 'refused' in answer ? answer.refused : null);
      if ('refused' in answer) return;
      // Decoded by the browser rather than a character at a time.
      pdfOverlay(await (await fetch(`data:application/pdf;base64,${answer.data}`)).blob());
    }, (error: unknown) => options.onError(`PDF not opened: ${failureText(error)}`));
  }

  function select(index: number | null): void {
    // Only a move resets the copy walk: the copy key's own click bubbles here and selects the same entry.
    if (index !== selected) copied = null;
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

  function stopTask(): void {
    const target = stopTarget(tasks.picked());
    if (target.kind === 'refused') return options.onNotice(target.reason);
    bridge.chatStopTask(slot, target.taskId).catch((error: unknown) => options.onError(`Task not stopped: ${failureText(error)}`));
  }

  function backgroundTask(): void {
    const target = backgroundTarget(tasks.picked());
    if (target.kind === 'refused') return options.onNotice(target.reason);
    bridge.chatBackgroundTasks(slot, target.kind === 'one' ? target.toolUseId : undefined).then((matched) => {
      if (!matched) options.onNotice(target.kind === 'one' ? 'That task is no longer in the foreground.' : 'Claude has no task running.');
    }, (error: unknown) => options.onError(`Not sent to the background: ${failureText(error)}`));
  }

  function choose(change: ChatPreferences): void {
    // A model picked here or on another screen shows over the measured name until the next measure.
    if ('model' in change && (change.model ?? null) !== model) {
      model = change.model ?? null;
      if (measured) measured = { ...measured, model: null };
    }
    if (change.permissionMode) mode = change.permissionMode;
    if ('effort' in change) effort = change.effort ?? null;
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
      if (holdsKeyboard()) ask.focus();
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

  // Every file Claude changed in the conversation, each under a line naming it, on a sheet to read.
  function showDiff(): void {
    const files = sessionEdits(transcript.entries);
    if (files.length === 0) return options.onNotice('Claude has not changed a file in this conversation.');
    const review = document.createElement('div');
    review.append(...files.flatMap((file) => {
      const heading = document.createElement('div');
      heading.className = 'chat-diff-file';
      heading.textContent = editsHeading(file);
      return [heading, diffBlock(file.lines)];
    }));
    viewerOverlay('diff-viewer', review);
  }

  // Refused under a running turn, as /resume is. A conversation put back holds its prompt in the box
  // again, ready to edit and send, unless something was typed there meanwhile.
  function showRewind(): void {
    if (working(transcript, asks.length)) {
      options.onNotice('Claude is still working. Escape stops it; then rewind.');
      return;
    }
    void rewind(bridge, slot, options).then((text) => {
      if (text !== undefined && !prompt.value.trim()) prompt.value = text;
      focus();
    });
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

  // The project's earlier prompts in a search sheet, as Claude Code's Ctrl+R searches them; the one
  // picked goes in the box to edit or send, over whatever was there. This screen's own conversation
  // comes first, from what it holds rather than read off disk again.
  function showHistory(): void {
    bridge.chatHistory(slot).then(async (earlier) => {
      const prompts = promptHistory([sentPrompts(transcript.entries), ...earlier]);
      if (prompts.length === 0) return options.onNotice('This project has no prompts sent yet.');
      const picked = await searchOverlay({
        name: 'chat-history', placeholder: 'Search prompts', rows: (query) => historyRows(prompts, query),
        empty: 'No prompt matches.', glyph: () => 'claude',
      });
      if (picked !== undefined) {
        prompt.value = picked;
        prompt.dispatchEvent(new Event('input'));
      }
      focus();
    }, (error: unknown) => options.onError(`Earlier prompts not listed: ${failureText(error)}`));
  }

  // The effort levels in a search sheet, as Claude Code's /effort offers them, or straight to the one
  // named after the command; the next turn runs at it, on every screen.
  function showEfforts(name: string): void {
    if (name) {
      const named = namedEffort(name);
      if (named === undefined) options.onNotice(`Claude has no effort ${name}. Try auto, ${EFFORT_LEVELS.join(', ')}.`);
      else configure({ effort: named });
      return;
    }
    void searchOverlay({
      name: 'chat-effort', placeholder: 'Search effort levels', rows: (query) => effortRows(effort, query),
      empty: 'No level matches.', glyph: () => 'claude',
    }).then((picked) => {
      if (picked !== undefined) configure({ effort: picked });
      focus();
    });
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
    question: () => (asks.length > 0 ? permissionTitle(asks[0]) : null),
    // Reads the conversation in and measures it; the page calls it once, when it is built.
    open() {
      readEarlier();
      measure();
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
        const fold = chosen ? foldOf(chosen) : null;
        if (fold) fold.open = !fold.open;
      }
      // Escape closes an open command list first, as in Claude Code. Otherwise always sent: this screen
      // may not know of a turn another one started, and interrupting an idle session does nothing.
      if (command === 'interrupt' && menu.open()) menu.update('', []);
      else if (command === 'interrupt') bridge.chatInterrupt(slot);
      if (command === 'suggestion') acceptSuggestion();
      if (command === 'history') showHistory();
      if (command === 'task-select') tasks.step();
      if (command === 'task-stop') stopTask();
      if (command === 'task-background') backgroundTask();
      if (command === 'image') {
        // An image first, as before there were tiles, then the first PDF.
        const chosen = selected === null ? attached : drawn[selected].element;
        const image = chosen.querySelector('img');
        const tile = chosen.querySelector<HTMLElement>(`.${PDF_TILE}`);
        if (image) imageOverlay(image.src);
        else if (tile) openPdf(tile);
      }
      // The same button a click on the block presses, so the tick shows which block was copied.
      if (command === 'copy' && selected !== null) {
        const buttons = drawn[selected].element.querySelectorAll<HTMLButtonElement>('.chat-copy');
        const block = nextCopyBlock(copied, selected, buttons.length);
        if (block === null) options.onNotice('This entry has no block to copy. A tool call or message shows its blocks once unfolded.');
        else {
          buttons[block].click();
          copied = { entry: selected, block };
        }
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
