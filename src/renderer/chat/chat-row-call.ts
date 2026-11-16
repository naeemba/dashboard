import type { PermissionAsk } from '../../shared/chat/chat-elicitation';
import { CALL_FIELD, CALL_WIDTH } from './chat-tools';

// The line a manager row prints for a tool call a digit there may allow: the tool's name and the
// command, path or URL it is about to use. A digit answers a permission prompt only when the row shows
// this line. Otherwise the wrong row highlighted and a `1` approve a call nobody read. A tool whose
// call is not one field (a plan, an agent's prompt, an MCP tool's arguments) gets null, and it is
// answered on the screen itself.

// A command's later lines are joined on with ⏎ rather than dropped, so `echo ok` above `rm -rf ~` never
// reads as `echo ok`. A line too long for the row is cut and ends with an ellipsis, so the cut shows.
export function rowCall(ask: PermissionAsk): string | null {
  const field = CALL_FIELD.get(ask.toolName);
  const value = field && ask.input[field];
  if (typeof value !== 'string' || value.trim() === '') return null;
  const line = `${ask.toolName}: ${value.trim().split(/\s*\n\s*/).join(' ⏎ ')}`;
  return line.length > CALL_WIDTH ? `${line.slice(0, CALL_WIDTH - 1)}…` : line;
}
