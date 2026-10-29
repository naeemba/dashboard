import './chat.css';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatCommand } from './actions';
import type { ChatContent, DashboardBridge } from './bridge';
import { createAskPanel } from './chat-ask-view';
import { drawEntry, type DrawnEntry } from './chat-entries';
import { renderMarkdown } from './chat-markdown';
import { permissionTitle, type PermissionAsk } from './chat-permission';
import {
  addPrompt, applyEvent, applyMessage, EMPTY_TRANSCRIPT, type ChatEvent, type ChatImage, type Transcript,
} from './chat-transcript';
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

// What the model key walks. Undefined is whatever the session's own settings choose.
const MODELS: (string | undefined)[] = [undefined, 'opus', 'sonnet', 'haiku'];
// Plan mode has no screen of its own here yet, so the key walks the two modes the pane can show.
const MODES: PermissionMode[] = ['default', 'acceptEdits'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

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
    asks = asks.filter((each) => each.id !== id);
    showAsk();
    if (asks.length === 0) prompt.focus();
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
  let model: string | undefined;
  let mode: PermissionMode = 'default';
  let context: number | null = null;
  let earlierRead = false;

  // ponytail: content-visibility skips laying out what is off screen, and markdown is only rendered
  // for an entry once it comes near; every entry still has its box. Recycle boxes if a session long
  // enough to need it turns up.
  const nearScreen = new IntersectionObserver((seen) => {
    for (const each of seen) {
      if (!each.isIntersecting) continue;
      nearScreen.unobserve(each.target);
      drawn.find((entry) => entry.element === each.target)?.fill?.();
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

  let liveFrame = 0;
  function render(): void {
    const stick = atBottom();
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
      if (fresh.fill) nearScreen.observe(fresh.element);
      drawn[index] = fresh;
    });
    // Markdown for the streaming block once a frame, not once a token.
    if (!liveFrame) {
      liveFrame = requestAnimationFrame(() => {
        liveFrame = 0;
        live.hidden = transcript.live === '';
        live.innerHTML = transcript.live ? renderMarkdown(transcript.live) : '';
        if (stick) log.scrollTop = log.scrollHeight;
      });
    }
    drawFoot();
    if (stick) log.scrollTop = log.scrollHeight;
  }

  function measure(): void {
    bridge.chatMeasure(slot).then((usage) => {
      if (usage) context = usage.percentage;
      drawFoot();
    }, () => undefined);
  }

  function showAsk(): void {
    ask.show(asks[0] ?? null);
    drawFoot();
  }

  // On screen and in front: the screen is not under a hidden view or page, and the window has focus.
  const seen = () => document.hasFocus() && element.closest('[hidden]') === null;

  function send(): void {
    const text = prompt.value.trim();
    if (!text && images.length === 0) return;
    const content: ChatContent = [
      ...images.map((picture) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: picture.mediaType as typeof IMAGE_TYPES[number], data: picture.data },
      })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
    bridge.chatSend(slot, content);
    transcript = addPrompt(transcript, text, images);
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

  function configure(change: { model?: string; permissionMode?: PermissionMode }): void {
    drawFoot();
    bridge.chatConfigure(slot, change).catch((error: unknown) => options.onError(`Claude setting not changed: ${failureText(error)}`));
  }

  function readEarlier(): void {
    if (earlierRead) return;
    earlierRead = true;
    bridge.chatRead(slot).then(({ messages }) => {
      // Something sent before the read came back is newer than anything in it.
      if (transcript.entries.length > 0) return;
      transcript = messages.reduce(applyMessage, transcript);
      render();
      log.scrollTop = log.scrollHeight;
    }, (error: unknown) => options.onError(`Earlier conversation not read: ${failureText(error)}`));
  }

  return {
    element,
    open() {
      readEarlier();
      if (asks.length > 0) ask.focus();
      else prompt.focus();
    },
    focus() {
      if (asks.length > 0) ask.focus();
      else prompt.focus();
    },
    receive(event) {
      if (event.kind === 'ask') {
        asks = [...asks, event.ask];
        if (asks.length === 1) {
          showAsk();
          if (seen()) ask.focus();
        }
        if (!seen()) bridge.notify(options.projectName, `Claude is asking: ${permissionTitle(event.ask)}`, options.paneId);
        return;
      }
      if (event.kind === 'ask-gone') {
        const wasFirst = asks[0]?.id === event.id;
        asks = asks.filter((each) => each.id !== event.id);
        if (wasFirst) {
          showAsk();
          if (asks.length === 0 && seen()) prompt.focus();
        }
        return;
      }
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
      if (command === 'interrupt' && (transcript.busy || asks.length > 0)) bridge.chatInterrupt(slot);
      if (command === 'model') configure({ model: (model = next(MODELS, model)) });
      if (command === 'permission-mode') configure({ permissionMode: (mode = next(MODES, mode)) });
      // Not under a running turn: the reset closes the session, and what Claude was half-way through
      // doing would stop with nothing on screen saying so.
      if (command === 'new' && (transcript.busy || asks.length > 0)) {
        options.onNotice('Claude is still working. Escape stops it; then start the new conversation.');
      } else if (command === 'new') {
        bridge.chatReset(slot);
        for (const entry of drawn) entry.element.remove();
        transcript = EMPTY_TRANSCRIPT;
        drawn = [];
        selected = null;
        asks = [];
        context = null;
        showAsk();
        render();
        prompt.focus();
      }
    },
  };
}
