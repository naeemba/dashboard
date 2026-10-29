import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatContent } from './bridge';
import { isRecord } from './is-record';
import type { PermissionAsk } from './chat-permission';
import type { ChatPreferences } from './chat-sessions';

// What main sends the chat pane, one per thing that happened in its session. `message` is an
// SDKMessage as the Agent SDK yields it, or a line of a saved session read back for a resume; the two
// are the same shape where this file reads them, and everything is read as maybe missing.
export type ChatEvent =
  | { kind: 'message'; message: Record<string, unknown> }
  // A prompt sent from any screen. The session does not echo one back, so main does, and every screen
  // shows what was asked rather than only the one it was typed on.
  | { kind: 'prompt'; content: ChatContent }
  // A model or permission mode a screen picked, so every screen's foot says the same.
  | { kind: 'configured'; change: ChatPreferences }
  | { kind: 'ask'; ask: PermissionAsk }
  // A question main stopped waiting on: the turn was interrupted, or the session ended under it.
  | { kind: 'ask-gone'; id: string }
  // A new conversation started from any screen: every screen clears the old one.
  | { kind: 'reset' }
  | { kind: 'ended'; error: string | null };

// The images the API takes, and so the only ones a pasted image is sent as.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageType = typeof IMAGE_TYPES[number];

// The API refuses an image whose base64 is over 5 MB, so a bigger paste would only end the turn in an
// error. The cap is on all of a prompt's images together, which also keeps a prompt sent from the
// second screen under the host's frame limit (MAX_FRAME_BYTES).
const IMAGE_LIMIT = 5 * 1024 * 1024;
export function imagesFit(base64Lengths: number[]): boolean {
  return base64Lengths.reduce((sum, length) => sum + length, 0) <= IMAGE_LIMIT;
}

export type ChatImage = { mediaType: string; data: string };

// A tool's output past this is cut when it arrives. A `cat` of a lockfile is a hundred thousand
// lines nobody reads in a chat, and the transcript would hold every one for the whole session.
const RESULT_LIMIT = 20_000;
export type ToolResult = { text: string; images: ChatImage[]; isError: boolean };

// One block of the conversation as the pane draws it. An entry is replaced, never edited, when it
// changes — a tool call getting its result — so the view can tell what to redraw by asking whether the
// object at a position is still the one it drew.
export type ChatEntry =
  | { kind: 'user'; text: string; images: ChatImage[] }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown>; result: ToolResult | null }
  | { kind: 'notice'; text: string };

export type Transcript = {
  entries: ChatEntry[];
  // The text block being streamed. It is shown under the entries and dropped when the finished
  // message arrives, which carries the same text whole.
  live: string;
  // Between sending a prompt and the turn's result. What Escape has something to interrupt in.
  busy: boolean;
  // The model the session says it is on, for the foot line until a model is picked there.
  model: string | null;
};

export const EMPTY_TRANSCRIPT: Transcript = { entries: [], live: '', busy: false, model: null };

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function image(block: Record<string, unknown>): ChatImage | null {
  const source = block.source;
  if (!isRecord(source) || source.type !== 'base64') return null;
  return { mediaType: text(source.media_type), data: text(source.data) };
}

function blocksOf(content: unknown): Record<string, unknown>[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function toolResult(block: Record<string, unknown>): ToolResult {
  const blocks = blocksOf(block.content);
  const said = blocks.filter((part) => part.type === 'text').map((part) => text(part.text)).join('\n');
  return {
    text: said.length > RESULT_LIMIT ? `${said.slice(0, RESULT_LIMIT)}\n… ${said.length - RESULT_LIMIT} more characters` : said,
    images: blocks.filter((part) => part.type === 'image').map(image).filter((part) => part !== null),
    isError: block.is_error === true,
  };
}

function withResult(entries: ChatEntry[], id: string, result: ToolResult): ChatEntry[] {
  return entries.map((entry) => (entry.kind === 'tool' && entry.id === id ? { ...entry, result } : entry));
}

function assistant(transcript: Transcript, content: unknown): Transcript {
  const entries = transcript.entries.slice();
  for (const block of blocksOf(content)) {
    if (block.type === 'text' && text(block.text).trim()) entries.push({ kind: 'text', text: text(block.text) });
    if (block.type === 'tool_use') {
      entries.push({
        kind: 'tool', id: text(block.id), name: text(block.name),
        input: isRecord(block.input) ? block.input : {}, result: null,
      });
    }
  }
  return { ...transcript, entries, live: '' };
}

function user(transcript: Transcript, content: unknown): Transcript {
  let entries = transcript.entries;
  const said: string[] = [];
  const images: ChatImage[] = [];
  for (const block of blocksOf(content)) {
    if (block.type === 'tool_result') entries = withResult(entries, text(block.tool_use_id), toolResult(block));
    if (block.type === 'text') said.push(text(block.text));
    if (block.type === 'image') {
      const picture = image(block);
      if (picture) images.push(picture);
    }
  }
  if (said.length > 0 || images.length > 0) entries = [...entries, { kind: 'user', text: said.join('\n'), images }];
  return { ...transcript, entries };
}

function streamed(transcript: Transcript, event: unknown): Transcript {
  if (!isRecord(event)) return transcript;
  if (event.type === 'content_block_start') return { ...transcript, live: '' };
  const delta = event.delta;
  if (event.type === 'content_block_delta' && isRecord(delta) && delta.type === 'text_delta') {
    return { ...transcript, live: transcript.live + text(delta.text) };
  }
  return transcript;
}

function resultNotice(message: Record<string, unknown>): string | null {
  if (message.subtype === 'success' && message.is_error !== true) return null;
  const errors = Array.isArray(message.errors) ? message.errors.map(String) : [];
  if (errors.length > 0) return errors.join('\n');
  if (message.subtype === 'error_during_execution') return 'Stopped.';
  return text(message.result) || text(message.subtype) || 'The turn ended with an error.';
}

// One message folded into the transcript. A subagent's own messages carry the id of the tool call
// that started it and are left out: the call's folded line and its result say what it did.
export function applyMessage(transcript: Transcript, message: Record<string, unknown>): Transcript {
  if (typeof message.parent_tool_use_id === 'string') return transcript;
  const inner = isRecord(message.message) ? message.message : {};
  switch (message.type) {
    case 'assistant': return assistant(transcript, inner.content);
    case 'user': return user(transcript, inner.content);
    case 'stream_event': return streamed(transcript, message.event);
    case 'result': {
      const notice = resultNotice(message);
      const entries = notice ? [...transcript.entries, { kind: 'notice', text: notice } as const] : transcript.entries;
      return { ...transcript, entries, live: '', busy: false };
    }
    case 'system':
      if (message.subtype === 'init') {
        return { ...transcript, model: text(message.model) || transcript.model };
      }
      if (message.subtype === 'compact_boundary') {
        return { ...transcript, entries: [...transcript.entries, { kind: 'notice', text: 'Conversation compacted.' }] };
      }
      return transcript;
    default: return transcript;
  }
}

export function applyEvent(transcript: Transcript, event: ChatEvent): Transcript {
  if (event.kind === 'message') return applyMessage(transcript, event.message);
  if (event.kind === 'prompt') return { ...user(transcript, event.content), busy: true };
  if (event.kind === 'ended') {
    const said = event.error ? `The session ended: ${event.error}` : 'The session ended.';
    return { ...transcript, busy: false, live: '', entries: [...transcript.entries, { kind: 'notice', text: said }] };
  }
  return transcript;
}

// What an event says about the model or permission mode the session is on: a choice made on some
// screen, or the mode the session started in, which its settings may have set.
export function preferencesOf(event: ChatEvent): ChatPreferences | null {
  if (event.kind === 'configured') return event.change;
  const message = event.kind === 'message' ? event.message : null;
  if (message?.type !== 'system' || message.subtype !== 'init' || typeof message.permissionMode !== 'string') return null;
  return { permissionMode: message.permissionMode as PermissionMode };
}

// The conversation read back from disk, unless something has already been drawn: a prompt sent or a
// message arrived before the read came back is newer than anything in it.
export function withEarlier(transcript: Transcript, messages: Record<string, unknown>[]): Transcript {
  return transcript.entries.length > 0 ? transcript : messages.reduce(applyMessage, transcript);
}

// A turn running or a question waiting: what a new conversation is refused under, since the reset
// would stop Claude half-way with nothing on screen saying so.
export function working(transcript: Transcript, waitingAsks: number): boolean {
  return transcript.busy || waitingAsks > 0;
}
