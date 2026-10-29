import { isRecord } from './is-record';
import type { PermissionAsk } from './chat-permission';

// What main sends the chat pane, one per thing that happened in its session. `message` is an
// SDKMessage as the Agent SDK yields it, or a line of a saved session read back for a resume; the two
// are the same shape where this file reads them, and everything is read as maybe missing.
export type ChatEvent =
  | { kind: 'message'; message: Record<string, unknown> }
  | { kind: 'ask'; ask: PermissionAsk }
  // A question main stopped waiting on: the turn was interrupted, or the session ended under it.
  | { kind: 'ask-gone'; id: string }
  | { kind: 'ended'; error: string | null };

export type ChatImage = { mediaType: string; data: string };
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
  sessionId: string | null;
  model: string | null;
  permissionMode: string | null;
};

export const EMPTY_TRANSCRIPT: Transcript = {
  entries: [], live: '', busy: false, sessionId: null, model: null, permissionMode: null,
};

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
  return {
    text: blocks.filter((part) => part.type === 'text').map((part) => text(part.text)).join('\n'),
    images: blocks.filter((part) => part.type === 'image').map(image).filter((part) => part !== null),
    isError: block.is_error === true,
  };
}

function withResult(entries: ChatEntry[], id: string, result: ToolResult): ChatEntry[] {
  const index = entries.findLastIndex((entry) => entry.kind === 'tool' && entry.id === id);
  if (index === -1) return entries;
  const next = entries.slice();
  next[index] = { ...(entries[index] as Extract<ChatEntry, { kind: 'tool' }>), result };
  return next;
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
        return {
          ...transcript,
          sessionId: text(message.session_id) || transcript.sessionId,
          model: text(message.model) || transcript.model,
          permissionMode: text(message.permissionMode) || transcript.permissionMode,
        };
      }
      if (message.subtype === 'compact_boundary') {
        return { ...transcript, entries: [...transcript.entries, { kind: 'notice', text: 'Conversation compacted.' }] };
      }
      return transcript;
    default: return transcript;
  }
}

// What you typed, put on screen at once: the session does not echo a prompt back.
export function addPrompt(transcript: Transcript, said: string, images: ChatImage[]): Transcript {
  return { ...transcript, busy: true, entries: [...transcript.entries, { kind: 'user', text: said, images }] };
}

export function applyEvent(transcript: Transcript, event: ChatEvent): Transcript {
  if (event.kind === 'message') return applyMessage(transcript, event.message);
  if (event.kind === 'ended') {
    const said = event.error ? `The session ended: ${event.error}` : 'The session ended.';
    return { ...transcript, busy: false, live: '', entries: [...transcript.entries, { kind: 'notice', text: said }] };
  }
  return transcript;
}
