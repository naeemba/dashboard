import type { InjectedMessage } from './chat-events';
import { stringOrEmpty as text } from '../app/is-record';

// Claude Code's hooks, as the session reports them when asked to (includeHookEvents): hook_started,
// then hook_response when it answers; the hook_progress lines between stay in main (relayed). Claude
// Code names the hook running over its prompt and prints one only when it fails, so the pane does the
// same: the working line says which hook runs, and a failed one is a folded line that unfolds to what
// it printed. A hook that succeeds leaves nothing, or a Bash hook on every call would put a line under
// each one.

const nameOf = (message: Record<string, unknown>): string => text(message.hook_name) || text(message.hook_event) || 'hook';

// The hook a session message says is running: its name when it starts, null once it has answered, and
// undefined for a message about no hook.
// ponytail: one name, the last started; a second hook running beside it shows as gone when the first
// answers. Keep them by hook_id if parallel hooks need naming.
export function runningHook(message: Record<string, unknown>): string | null | undefined {
  if (message.subtype === 'hook_started') return nameOf(message);
  if (message.subtype === 'hook_response') return null;
  return undefined;
}

// A hook that answered with an error, as the line the conversation gets; null for any other message.
// A hook's own complaint is on stderr, which a blocking exit 2 hands Claude as the reason.
export function hookFailure(message: Record<string, unknown>): InjectedMessage | null {
  if (message.subtype !== 'hook_response' || message.outcome !== 'error') return null;
  const code = typeof message.exit_code === 'number' ? ` (exit ${message.exit_code})` : '';
  const body = text(message.stderr) || text(message.output) || text(message.stdout);
  return { title: `${nameOf(message)} hook failed${code}`, body: body.trim() };
}
