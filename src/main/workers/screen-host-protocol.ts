import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'node:path';
import type { ScopedCommand } from '../processes/scope';

// What the app and the screen host say to each other: one JSON message per line over a unix socket,
// as the pane host's do (pane-host-protocol.ts). workers-decision-6 says why worker screens run there.

// In the socket's name, for the reason PROTOCOL_VERSION in pane-host-protocol.ts gives. A bump leaves
// the old host's sessions running unseen, so a worker brought back resumes its conversation in a second
// process: bump only for a change an older host would misread.
const PROTOCOL_VERSION = 1;

// Beside the pane host's, in a private folder of the user data, so a second Dashboard on its own
// --user-data-dir has a host of its own. Windows has none: a named pipe there needs the proof the pane
// host does (paneHostAddress), and worker screens run in the app as before.
export function screenHostSocket(platform: string, userData: string): string | null {
  if (!hasScreenHost(platform)) return null;
  return path.join(userData, 'screen-host', `screens-${PROTOCOL_VERSION}.sock`);
}

// Windows has none (above), which is why a worker there is a terminal unless asked (session-cli.ts).
export function hasScreenHost(platform: string): boolean {
  return platform !== 'win32';
}

// What a session starts on, on either side of the socket: chat-sessions.ts's prompts and options,
// and the systemd scope main chose for its Claude (claude-process.ts). An older app sends none, and
// an older host ignores it: that session's Claude runs unscoped.
export type HostedParams = { prompt: AsyncIterable<SDKUserMessage>; options: Options; scope?: ScopedCommand };

// A session run in the host, as the app drives it. `unit` is the scope its Claude runs in as the host
// answers it: one it kept started in its own, not the one asked for now. Null when it is unscoped or a
// host from an older build kept it.
export type HostedSession = { query: Query; unit: string | null };

// The callbacks a session can ask the app for and wait on the answer.
export type AskCallback = 'canUseTool' | 'onElicitation';

// A session's options as a line can carry them: the callbacks stay in the app, and the host calls
// back for them. `hooks` names the events the app has hooks on.
export type HostedStart = { options: Omit<Options, AskCallback | 'hooks'>; hooks: string[]; scope?: ScopedCommand };

// `key` is the worker's conversation id, which stays the same across a restart where its pane id does not.
export type ToScreenHost =
  | { type: 'hello' }
  // Starts the session, or takes up the one the host is already running under the key.
  | ({ type: 'start'; key: string } & HostedStart)
  | { type: 'prompt'; key: string; message: SDKUserMessage }
  // Any method of the session's Query, answered by a reply with the same id.
  | { type: 'call'; key: string; id: number; method: string; args: unknown[] }
  | { type: 'answer'; key: string; id: string; value: unknown }
  | { type: 'stop'; key: string };

// A session the host is running. `busy` while a turn is under way: a prompt was taken and no result came.
// `unit` is the scope its Claude started in, null for none; a host from an older build sends none.
export type KeptSession = { key: string; busy: boolean; unit?: string | null };

export type FromScreenHost =
  | { type: 'sessions'; sessions: KeptSession[] }
  // Another app is connected; this one runs its worker screens itself.
  | { type: 'busy' }
  | { type: 'message'; key: string; message: unknown }
  // A callback's arguments, its signal left out: `ask-gone` is the abort.
  | { type: 'ask'; key: string; id: string; callback: AskCallback; args: unknown[] }
  | { type: 'ask-gone'; key: string; id: string }
  | { type: 'hook'; key: string; event: string; input: unknown }
  | { type: 'reply'; key: string; id: number; value?: unknown; error?: string }
  | { type: 'ended'; key: string; error: string | null };
