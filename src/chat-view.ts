import './chat.css';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatCommand } from './actions';
import type { ChatContent, DashboardBridge } from './bridge';
import { createAskPanel } from './chat-ask-view';
import { drawEntry, type DrawnEntry } from './chat-entries';
import { renderMarkdown } from './chat-markdown';
import { permissionTitle, type PermissionAsk } from './chat-permission';
import {
  applyEvent, EMPTY_TRANSCRIPT, IMAGE_TYPES, imagesFit, preferencesOf, withEarlier, working, type ChatEvent, type ChatImage,
  type ImageType, type Transcript,
} from './chat-transcript';
import type { ChatPreferences } from './chat-sessions';
import { clampIndex } from './clamp-index';
import { failureText } from './failure';
import { isModified } from './shortcuts';

// The Claude screen: a conversation drawn as HTML over a prompt box, run through the Agent SDK by
// chat-sessions.ts in main. The keys it answers through the window's lookup are rows in actions.ts and
// arrive as runCommand; the prompt box reads only Enter and Backspace for itself.

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
// Plan mode has no screen of its own here yet, so the key walks the two modes the pane can show.
const MODES: PermissionMode[] = ['default', 'acceptEdits'];

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
  prompt.placeholder = 'Ask Claude. Enter sends, Shift+Enter is a new line. Paste an image to attach it.';
  prompt.rows = 3;
  prompt.dir = 'auto';
  const foot = document.createElement('div');
  foot.className = 'chat-foot';
  element.append(log, ask.element, attached, prompt, foot);

  let transcript: Transcript = EMPTY_TRANSCRIPT;
  let drawn: DrawnEntry[] = [];
  let selected: number | null = null;
  let asks: PermissionAsk[] = [];
  let images: ChatImage[] = [];
  let model: string | null = null;
  let mode: PermissionMode = 'default';
  let context: number | null = null;
  let earlierRead = false;
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

  function drawFoot(): void {
    const shown = model ?? transcript.model ?? 'default model';
    const parts = [shown, mode === 'acceptEdits' ? 'accepting edits' : 'asking before edits'];
    if (context !== null) parts.push(`context ${Math.round(context)}%`);
    parts.push(asks.length > 0 ? 'waiting on you' : transcript.busy ? 'working…' : 'ready');
    const bar = document.createElement('span');
    bar.className = 'chat-context';
    bar.style.setProperty('--used', `${context ?? 0}%`);
    foot.replaceChildren(bar, parts.join(' · '));
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

  function measure(): void {
    bridge.chatMeasure(slot).then((percentage) => {
      if (percentage !== null) context = percentage;
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

  function send(): void {
    const text = prompt.value.trim();
    if (!text && images.length === 0) return;
    const content: ChatContent = [
      ...images.map((picture) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: picture.mediaType as ImageType, data: picture.data },
      })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
    // Main sends the prompt back to every screen, this one included, as a `prompt` event.
    bridge.chatSend(slot, content);
    prompt.value = '';
    images = [];
    attached.replaceChildren();
    selected = null;
    log.scrollTop = log.scrollHeight;
    render();
  }

  function drawAttached(): void {
    attached.replaceChildren(...images.map((_picture, index) => {
      const chip = document.createElement('span');
      chip.textContent = `image ${index + 1}`;
      return chip;
    }));
  }

  prompt.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      send();
    } else if (event.key === 'Backspace' && prompt.value === '' && images.length > 0) {
      images = images.slice(0, -1);
      drawAttached();
    }
  });

  prompt.addEventListener('paste', (event) => {
    const files = [...event.clipboardData?.files ?? []].filter((file) => (IMAGE_TYPES as readonly string[]).includes(file.type));
    if (files.length === 0) return;
    event.preventDefault();
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
  });

  // A link opens in the browser, where main decides what is safe to hand the system. A click on an
  // entry moves the selection there; a tool call's own summary unfolds it, which is what the unfold
  // key does on a selected one.
  log.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a');
    if (link) {
      event.preventDefault();
      bridge.openExternal(link.href);
      return;
    }
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
    drawFoot();
    bridge.chatConfigure(slot, change).catch((error: unknown) => options.onError(`Claude setting not changed: ${failureText(error)}`));
  }

  function choose(change: ChatPreferences): void {
    if ('model' in change) model = change.model ?? null;
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
    context = null;
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
      focus();
    },
    focus,
    receive(event) {
      if (event.kind === 'ask') return addAsk(event.ask);
      if (event.kind === 'ask-gone') return dropAsk(event.id);
      if (event.kind === 'reset') return clear();
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
      // Always sent: this screen may not know of a turn another one started, and interrupting an idle
      // session does nothing.
      if (command === 'interrupt') bridge.chatInterrupt(slot);
      if (command === 'model') configure({ model: (model = next(MODELS, model)) });
      if (command === 'permission-mode') configure({ permissionMode: (mode = next(MODES, mode)) });
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
