import { isRecord } from '../../shared/app/is-record';

// What the PreToolUse guards that `board guard` runs share (board-guard.ts, running-app-guard.ts): a
// field of the tool's input, the shell's redirect or tee into a file, and the refusal they print.

export function textField(input: unknown, field: string): string {
  const value = isRecord(input) ? input[field] : undefined;
  return typeof value === 'string' ? value : '';
}

// A `>`, `>>`, `tee` or `tee -a` into whatever follows.
export const SHELL_REDIRECT = String.raw`(?:>>?|\btee(?:\s+-a)?)`;

// A refusal as a PreToolUse hook prints it on stdout.
export function hookRefusal(reason: string) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: reason } };
}
