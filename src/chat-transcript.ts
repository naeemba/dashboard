import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { ChatContent } from './bridge';
import { localCommandOutput, shellExchange, typedCommand } from './chat-commands';
import { notTypedMessage } from './chat-events';
import { rateLimitNotice, retryNotice } from './chat-notices';
import { applyTaskMessage, type ChatTasks } from './chat-tasks';
import { hookFailure, runningHook } from './chat-hooks';
import { isRecord, stringOrEmpty } from './is-record';
import { timeOf } from './age';
import type { PermissionAsk } from './chat-permission';
import type { ChatPreferences } from './chat-sessions';
import type { QueuedPrompt } from './chat-queue';

// What main sends the chat pane, one per thing that happened in its session. `message` is an
// SDKMessage as the Agent SDK yields it, or a line of a saved session read back for a resume; the two
// are the same shape where this file reads them, and everything is read as maybe missing.
export type ChatEvent =
  | { kind: 'message'; message: Record<string, unknown> }
  // A prompt sent from any screen. The session does not echo one back, so main does, and every screen
  // shows what was asked rather than only the one it was typed on. `id` is the uuid main stamped it
  // with, which the session's command_lifecycle messages name it by.
  | { kind: 'prompt'; content: ChatContent; id: string }
  // A model or permission mode a screen picked, so every screen's foot says the same.
  | { kind: 'configured'; change: ChatPreferences }
  | { kind: 'ask'; ask: PermissionAsk }
  // A question main stopped waiting on: the turn was interrupted, or the session ended under it.
  | { kind: 'ask-gone'; id: string }
  // A new conversation started from any screen: every screen clears the old one. `sessionGoesOn` marks
  // the session's own /clear, where the process, and the prompts queued in it, carry on.
  | { kind: 'reset'; sessionGoesOn?: true }
  | { kind: 'ended'; error: string | null };

// The images the API takes, and so the only ones a pasted image is sent as.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageType = typeof IMAGE_TYPES[number];
export const isImageType = (type: string): boolean => (IMAGE_TYPES as readonly string[]).includes(type);

// The API refuses an image whose base64 is over 5 MB, so a bigger paste would only end the turn in an
// error. The cap is on all of a prompt's images together, which also keeps a prompt sent from the
// second screen under the host's frame limit (MAX_FRAME_BYTES).
const IMAGE_LIMIT = 5 * 1024 * 1024;
export function imagesFit(base64Lengths: number[]): boolean {
  return base64Lengths.reduce((sum, length) => sum + length, 0) <= IMAGE_LIMIT;
}

export type ChatImage = { mediaType: string; data: string };

export function imageDataUrl(picture: ChatImage): string {
  return `data:${picture.mediaType};base64,${picture.data}`;
}

// A tool's output past this is cut when it arrives. A `cat` of a lockfile is a hundred thousand
// lines nobody reads in a chat, and the transcript would hold every one for the whole session.
const RESULT_LIMIT = 20_000;
export type ToolResult = { text: string; images: ChatImage[]; isError: boolean };

// One block of the conversation as the pane draws it. An entry is replaced, never edited, when it
// changes — a tool call getting its result — so the view can tell what to redraw by asking whether the
// object at a position is still the one it drew.
export type ChatEntry =
  // `ran` marks the line of a command run with `!`: drawn as typed, but never recalled by Up, since this
  // screen would send it to Claude as a prompt.
  | { kind: 'user'; text: string; images: ChatImage[]; ran?: true } & Stamp
  | { kind: 'text'; text: string } & Stamp
  // `steps` is what a subagent the call started has done so far, its own conversation folded the same way.
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown>; result: ToolResult | null; steps?: ChatEntry[] }
  | { kind: 'notice'; text: string }
  // What a command run with `!` printed. The command itself is a user entry, `! git push`.
  | { kind: 'shell'; text: string }
  // A message Claude Code put in the conversation rather than a person (chat-events.ts), or Claude's
  // thinking, folded to its title. `startsTurn` when the message opens a turn, as a prompt does.
  // `verbatim` is a failed hook's: what it printed, drawn as terminal text rather than markdown.
  | { kind: 'event'; title: string; body: string; startsTurn?: true; verbatim?: true };

// When a message was written and the model that wrote it, as far as the message says: drawn above
// it (chat-stamp.ts). A saved line and a live message both carry the time; only Claude's carry a model.
export type Stamp = { at?: number; model?: string };

function stampOf(message: Record<string, unknown>, inner: Record<string, unknown>): Stamp {
  const at = timeOf(text(message.timestamp));
  const model = text(inner.model);
  // Claude Code's own notices (a session limit, an API error) say `<synthetic>`: no model wrote them.
  return { ...(at === undefined ? {} : { at }), ...(model && model !== '<synthetic>' ? { model } : {}) };
}

export type Transcript = {
  entries: ChatEntry[];
  // The text block being streamed. It is shown under the entries and dropped when the finished
  // message arrives, which carries the same text whole.
  live: string;
  // Between sending a prompt and the turn's result. What Escape has something to interrupt in.
  busy: boolean;
  // The model the session says it is on, for the foot line until a model is picked there.
  model: string | null;
  // The Claude Code version the session runs, for the status line.
  version: string | null;
  // What the running turn has streamed so far, text and thinking alike, in characters: the
  // working line's token count, as Claude Code's estimates it while a response streams. And whether
  // the block streaming now is thinking.
  streamed: number;
  thinking: boolean;
  // When the running turn began, for the working line's seconds; null with no turn. Kept here rather
  // than in the view, so a question mid-turn does not start the clock over.
  started: number | null;
  // The agents, workflows and background commands running now (chat-tasks.ts).
  tasks: ChatTasks;
  // The hook running now, for the working line (chat-hooks.ts); null with none.
  hook: string | null;
  // Prompts sent while a turn ran, drawn grey under the conversation until the session takes them.
  queued: QueuedPrompt[];
  // What Claude guesses you will ask next, sent after a turn's result; null once anything starts the
  // next turn. Drawn in the empty box, and Tab puts it there.
  suggestion: string | null;
};

export const EMPTY_TRANSCRIPT: Transcript = {
  entries: [], live: '', busy: false, model: null, version: null, streamed: 0, thinking: false, started: null, tasks: [], hook: null, suggestion: null, queued: [],
};

// No turn running: nothing streaming, nothing counted.
const IDLE = { live: '', busy: false, streamed: 0, thinking: false, started: null, hook: null, suggestion: null } as const;

const STREAMED_DELTAS: Record<string, string> = { text_delta: 'text', thinking_delta: 'thinking' };

const text = stringOrEmpty;

function image(block: Record<string, unknown>): ChatImage | null {
  const source = block.source;
  if (!isRecord(source) || source.type !== 'base64') return null;
  return { mediaType: text(source.media_type), data: text(source.data) };
}

function blocksOf(content: unknown): Record<string, unknown>[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

// A message's text blocks, joined.
function textOf(content: unknown): string {
  return blocksOf(content).filter((part) => part.type === 'text').map((part) => text(part.text)).join('\n');
}

function toolResult(block: Record<string, unknown>): ToolResult {
  const blocks = blocksOf(block.content);
  const said = textOf(block.content);
  return {
    text: said.length > RESULT_LIMIT ? `${said.slice(0, RESULT_LIMIT)}\n… ${said.length - RESULT_LIMIT} more characters` : said,
    images: blocks.filter((part) => part.type === 'image').map(image).filter((part) => part !== null),
    isError: block.is_error === true,
  };
}

function withResult(entries: ChatEntry[], id: string, result: ToolResult): ChatEntry[] {
  return entries.map((entry) => (entry.kind === 'tool' && entry.id === id ? { ...entry, result } : entry));
}

function assistant(transcript: Transcript, content: unknown, stamp: Stamp): Transcript {
  const entries = transcript.entries.slice();
  for (const block of blocksOf(content)) {
    if (block.type === 'text' && text(block.text).trim()) entries.push({ kind: 'text', text: text(block.text), ...stamp });
    // Thinking folds to one line, like a message Claude Code injected. A redacted block, or one whose
    // display was omitted, has no text and draws nothing.
    if (block.type === 'thinking' && text(block.thinking).trim()) entries.push({ kind: 'event', title: 'Thinking', body: text(block.thinking) });
    if (block.type === 'tool_use') {
      entries.push({
        kind: 'tool', id: text(block.id), name: text(block.name),
        input: isRecord(block.input) ? block.input : {}, result: null,
      });
    }
  }
  return { ...transcript, entries, live: '' };
}

// What the session writes into the conversation in the user's name when a turn is stopped: drawn as
// the notice the stop is, not as something you said.
const INTERRUPTED = /^\[Request interrupted by user/;
const STOPPED = { kind: 'notice', text: 'Stopped.' } satisfies ChatEntry;

function user(transcript: Transcript, content: unknown, stamp: Stamp): Transcript {
  let entries = transcript.entries;
  const said: string[] = [];
  const images: ChatImage[] = [];
  let ran = false;
  for (const block of blocksOf(content)) {
    if (block.type === 'tool_result') entries = withResult(entries, text(block.tool_use_id), toolResult(block));
    if (block.type === 'text' && INTERRUPTED.test(text(block.text))) entries = [...entries, STOPPED];
    else if (block.type === 'text') {
      // A slash command's output is the notice it is, not something you said.
      const printed = localCommandOutput(text(block.text));
      if (printed !== null) {
        if (printed) entries = [...entries, { kind: 'notice', text: printed }];
        continue;
      }
      const shell = shellExchange(text(block.text));
      if (shell?.kind === 'output') entries = [...entries, { kind: 'shell', text: shell.text }];
      if (shell?.kind === 'input') ran = true;
      if (shell?.kind !== 'output') said.push(shell?.text ?? typedCommand(text(block.text)) ?? text(block.text));
    }
    if (block.type === 'image') {
      const picture = image(block);
      if (picture) images.push(picture);
    }
  }
  if (said.length > 0 || images.length > 0) entries = [...entries, { kind: 'user', text: said.join('\n'), images, ...(ran ? { ran: true as const } : {}), ...stamp }];
  return { ...transcript, entries };
}

function streamed(transcript: Transcript, event: unknown): Transcript {
  if (!isRecord(event)) return transcript;
  if (event.type === 'content_block_start') {
    const block = isRecord(event.content_block) ? event.content_block : {};
    return { ...transcript, live: '', thinking: block.type === 'thinking' || block.type === 'redacted_thinking' };
  }
  const delta = event.delta;
  if (event.type !== 'content_block_delta' || !isRecord(delta) || typeof delta.type !== 'string') return transcript;
  const field = STREAMED_DELTAS[delta.type];
  if (!field) return transcript;
  const piece = text(delta[field]);
  const live = delta.type === 'text_delta' ? transcript.live + piece : transcript.live;
  return { ...transcript, live, streamed: transcript.streamed + piece.length };
}

// A stopped turn says so once: the session has usually written its own stop into the conversation
// already, just before the result.
// The SDK's own diagnostic in a result's errors, `[ede_diagnostic] result_type=...`, says how the turn
// ended for whoever debugs the SDK, not what went wrong for you, and is left out.
const DIAGNOSTIC = /^\[ede_diagnostic\]/;

function resultNotice(message: Record<string, unknown>, last: ChatEntry | undefined): string | null {
  if (message.subtype === 'success' && message.is_error !== true) return null;
  const errors = Array.isArray(message.errors) ? message.errors.map(String).filter((error) => !DIAGNOSTIC.test(error)) : [];
  if (errors.length > 0) return errors.join('\n');
  if (message.subtype === 'error_during_execution') return last?.kind === 'notice' && last.text === STOPPED.text ? null : STOPPED.text;
  return text(message.result) || text(message.subtype) || 'The turn ended with an error.';
}

// The skill a Skill call loaded, read off the call the instructions answer, which is a recent one.
function skillOf(entries: ChatEntry[], id: unknown): string | undefined {
  const call = entries.findLast((entry) => entry.kind === 'tool' && entry.id === id);
  return call?.kind === 'tool' && typeof call.input.skill === 'string' ? call.input.skill : undefined;
}

// A system message about the running tasks, folded into them; the same transcript for any other, so
// nothing redraws.
function withTasks(transcript: Transcript, message: Record<string, unknown>): Transcript {
  const tasks = applyTaskMessage(transcript.tasks, message);
  return tasks === transcript.tasks ? transcript : { ...transcript, tasks };
}

// A system message about a hook, folded into the working line and, when it failed, the conversation;
// the same transcript for any other.
function withHook(transcript: Transcript, message: Record<string, unknown>): Transcript {
  const hook = runningHook(message);
  if (hook === undefined) return transcript;
  const failure = hookFailure(message);
  if (!failure && hook === transcript.hook) return transcript;
  const entries = failure ? [...transcript.entries, { kind: 'event' as const, ...failure, verbatim: true as const }] : transcript.entries;
  return { ...transcript, hook, entries };
}

// A user message: its tool results reach their calls, and one Claude Code wrote rather than a person
// folds to the one line it is, or to nothing.
function userMessage(transcript: Transcript, message: Record<string, unknown>): Transcript {
  const inner = isRecord(message.message) ? message.message : {};
  // Meta or synthetic and holding no tool result: a synthetic message can carry one, and it must
  // still reach its call.
  const meta = (message.isMeta === true || message.isSynthetic === true)
    && !blocksOf(inner.content).some((block) => block.type === 'tool_result');
  const folded = notTypedMessage(message.origin, meta, textOf(inner.content), meta ? skillOf(transcript.entries, message.sourceToolUseID) : undefined);
  if (folded === 'hidden') return transcript;
  if (folded) return { ...transcript, entries: [...transcript.entries, { kind: 'event', ...folded }] };
  return user(transcript, inner.content, stampOf(message, inner));
}

// A subagent's own message, folded into the steps of the call that started it, wherever that call
// sits: a subagent's subagent is a call in its starter's steps. The same entries when no call has the id.
function withSteps(entries: ChatEntry[], id: string, message: Record<string, unknown>): ChatEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.kind !== 'tool' || (entry.id !== id && !entry.steps)) return entry;
    const steps = entry.id === id ? stepsAfter(entry.steps ?? [], message) : withSteps(entry.steps ?? [], id, message);
    if (steps === entry.steps || (steps.length === 0 && !entry.steps)) return entry;
    changed = true;
    return { ...entry, steps };
  });
  return changed ? next : entries;
}

// A step's tool output is never drawn, only whether it failed, so it is not kept. Plain text in the
// subagent's name is left out: its first is its prompt, which the call's input already shows. What
// Claude Code wrote for it, such as a skill it loaded, is one line, as it is in the main conversation.
// Its thinking is left out: folded to a step it would be a bare "Thinking" line with nothing under it.
// The same steps when the message added or changed none, so the call does not redraw.
function stepsAfter(steps: ChatEntry[], message: Record<string, unknown>): ChatEntry[] {
  const inner = isRecord(message.message) ? message.message : {};
  const subagent = { ...EMPTY_TRANSCRIPT, entries: steps };
  const said = blocksOf(inner.content).filter((block) => block.type !== 'thinking');
  const after = message.type === 'assistant' ? assistant(subagent, said, {}) : userMessage(subagent, message);
  const next = after.entries.filter((step) => step.kind !== 'user').map((step): ChatEntry => {
    if (step.kind === 'event') return { kind: 'notice', text: step.title };
    if (step.kind === 'tool' && step.result && (step.result.text || step.result.images.length > 0)) {
      return { ...step, result: { text: '', images: [], isError: step.result.isError } };
    }
    return step;
  });
  return next.length === steps.length && next.every((step, index) => step === steps[index]) ? steps : next;
}

// One message folded into the transcript. A subagent's own messages carry the id of the tool call
// that started it and go into that call's steps; only what it said and the tools it called are kept.
export function applyMessage(transcript: Transcript, message: Record<string, unknown>): Transcript {
  if (typeof message.parent_tool_use_id === 'string') {
    if (message.type !== 'assistant' && message.type !== 'user') return transcript;
    const entries = withSteps(transcript.entries, message.parent_tool_use_id, message);
    return entries === transcript.entries ? transcript : { ...transcript, entries };
  }
  const inner = isRecord(message.message) ? message.message : {};
  // A turn under way, whoever started it, is past what the last one suggested.
  if (transcript.suggestion !== null && (message.type === 'assistant' || message.type === 'user' || message.type === 'stream_event')) {
    transcript = { ...transcript, suggestion: null };
  }
  switch (message.type) {
    case 'prompt_suggestion': return { ...transcript, suggestion: text(message.suggestion).trim() || null };
    case 'assistant': return assistant(transcript, inner.content, stampOf(message, inner));
    case 'user': return userMessage(transcript, message);
    case 'stream_event': return streamed(transcript, message.event);
    case 'command_lifecycle': return taken(transcript, message);
    case 'result': {
      const notice = resultNotice(message, transcript.entries.at(-1));
      const entries = notice ? [...transcript.entries, { kind: 'notice', text: notice } as const] : transcript.entries;
      return { ...transcript, ...IDLE, entries };
    }
    case 'system':
      if (message.subtype === 'init') {
        return { ...transcript, model: text(message.model) || transcript.model, version: text(message.claude_code_version) || transcript.version };
      }
      if (message.subtype === 'compact_boundary') {
        return { ...transcript, entries: [...transcript.entries, { kind: 'notice', text: 'Conversation compacted.' }] };
      }
      if (message.subtype === 'api_retry') {
        return { ...transcript, entries: [...transcript.entries, { kind: 'notice', text: retryNotice(message) }] };
      }
      return withHook(withTasks(transcript, message), message);
    case 'rate_limit_event': {
      const notice = rateLimitNotice(message);
      if (!notice || transcript.entries.some((entry) => entry.kind === 'notice' && entry.text === notice)) return transcript;
      return { ...transcript, entries: [...transcript.entries, { kind: 'notice', text: notice }] };
    }
    default: return transcript;
  }
}

// A queued prompt joins the conversation where the session read it: started in the next turn, or
// folded into the running one, which reports it done without a start of its own. One withdrawn
// leaves the screen. A prompt this screen never queued, sent while idle, is already drawn.
function taken(transcript: Transcript, message: Record<string, unknown>): Transcript {
  const waiting = transcript.queued.find((each) => each.id === message.command_uuid);
  if (!waiting || message.state === 'queued') return transcript;
  const queued = transcript.queued.filter((each) => each !== waiting);
  if (message.state === 'cancelled') return { ...transcript, queued };
  return joinTurn({ ...transcript, queued }, waiting.content);
}

// A prompt taken into a running turn joins it, so its count goes on.
function joinTurn(transcript: Transcript, content: ChatContent): Transcript {
  const now = Date.now();
  const fresh = transcript.busy ? {} : { streamed: 0, thinking: false, started: now };
  return { ...user(transcript, content, { at: now }), busy: true, suggestion: null, ...fresh };
}

export function applyEvent(transcript: Transcript, event: ChatEvent): Transcript {
  if (event.kind === 'message') return applyMessage(transcript, event.message);
  // Sent while a turn runs, it waits in the session's queue rather than joining the turn; so does one
  // sent between a turn's result and the next queued prompt starting, which the session runs after it.
  if (event.kind === 'prompt' && (transcript.busy || transcript.queued.length > 0)) {
    return { ...transcript, queued: [...transcript.queued, { id: event.id, content: event.content }], suggestion: null };
  }
  if (event.kind === 'prompt') return joinTurn(transcript, event.content);
  if (event.kind === 'ended') {
    const said = event.error ? `The session ended: ${event.error}` : 'The session ended.';
    // The tasks and the queued prompts went with the process that held them, and the next one never
    // reports their end.
    return { ...transcript, ...IDLE, tasks: [], queued: [], entries: [...transcript.entries, { kind: 'notice', text: said }] };
  }
  return transcript;
}

// What a reset leaves on screen: nothing, unless the session goes on, when the prompts still waiting
// in it stay grey until it takes them.
export function afterReset(transcript: Transcript, event: Extract<ChatEvent, { kind: 'reset' }>): Transcript {
  return event.sessionGoesOn ? { ...EMPTY_TRANSCRIPT, queued: transcript.queued } : EMPTY_TRANSCRIPT;
}

// The permission mode a session message says the session is now in: the one it started in, which its
// settings may have set, or one it moved to by itself — a plan approved, an edit allowed with "do not
// ask again", which Claude Code answers by accepting edits for the rest of the session.
export function modeOf(message: Record<string, unknown>): PermissionMode | null {
  if (message.type !== 'system' || (message.subtype !== 'init' && message.subtype !== 'status')) return null;
  return typeof message.permissionMode === 'string' ? message.permissionMode as PermissionMode : null;
}

// Whether a session message says fast mode is on: `init` and every `result` carry it, which covers a
// session already running fast from the settings file, and a model or plan without it reporting off.
// Cooldown, paused after a rate limit, is still on: the choice stands and comes back by itself.
export function fastOf(message: Record<string, unknown>): boolean | null {
  const reports = message.type === 'result' || (message.type === 'system' && message.subtype === 'init');
  return reports && typeof message.fast_mode_state === 'string' ? message.fast_mode_state !== 'off' : null;
}

// What a session message changes about which conversation the page is on: `init` names the one the
// session is in, remembered when it differs; /clear's reset leaves none remembered until the next
// init, and every screen clears.
export function conversationChange(message: Record<string, unknown>, rememberedId: string | undefined): { remember?: string | null; reset: boolean } {
  if (message.type === 'conversation_reset') return { remember: null, reset: true };
  if (message.type === 'system' && message.subtype === 'init' && typeof message.session_id === 'string' && message.session_id !== rememberedId) {
    return { remember: message.session_id, reset: false };
  }
  return { reset: false };
}

// What an event says about the model, permission mode or fast mode the session is on: a choice made
// on some screen, or what the session reports.
export function preferencesOf(event: ChatEvent): ChatPreferences | null {
  if (event.kind === 'configured') return event.change;
  if (event.kind !== 'message') return null;
  return reportedPreferences(event.message);
}

// The permission mode and fast mode a session message reports, only the ones it names; null for none.
export function reportedPreferences(message: Record<string, unknown>): ChatPreferences | null {
  const mode = modeOf(message);
  const fast = fastOf(message);
  if (!mode && fast === null) return null;
  return { ...(mode && { permissionMode: mode }), ...(fast !== null && { fast }) };
}

// The conversation read back from disk, unless something has already been drawn: a prompt sent or a
// message arrived before the read came back is newer than anything in it. A failed hook's line does
// not count: a SessionStart hook can fail before a resumed conversation is read, and it goes after
// what was read instead of in place of it.
export function withEarlier(transcript: Transcript, messages: Record<string, unknown>[]): Transcript {
  if (transcript.entries.some((entry) => entry.kind !== 'event' || !entry.verbatim)) return transcript;
  const read = messages.reduce(applyMessage, { ...transcript, entries: [] });
  return { ...read, entries: [...read.entries, ...transcript.entries] };
}

// A turn running or a question waiting: what a new conversation is refused under, since the reset
// would stop Claude half-way with nothing on screen saying so.
export function working(transcript: Transcript, waitingAsks: number): boolean {
  return transcript.busy || waitingAsks > 0;
}
