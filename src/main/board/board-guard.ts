// The PreToolUse hook that keeps agents off the board's files (board-decision-8): an Edit, Write or
// NotebookEdit of a card file, or a shell command that redirects, tees or `sed -i`s into one, is refused
// with the command to use instead. What a hand edit costs is board-rule-1's: a card missing a field the
// app expects, repaired silently on the next read.
//
// One decision for every door: the app's own Claude screens call it as an SDK hook (chat-sessions.ts),
// and a terminal Claude runs it as `board guard` (board-program.ts), from a worker's settings and from
// the user's own ~/.claude/settings.json (board-guard-install.ts).

// The tools whose input names the file they write, and the field it is in.
const FILE_FIELDS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

// What a hook's matcher has to let through for this to see every call it refuses.
export const GUARDED_TOOLS = [...Object.keys(FILE_FIELDS), 'Bash'].join('|');

// The hook as a settings file names it, for every Claude the app starts: a terminal worker's
// --settings (dispatch.ts) and a Claude screen's (chat-sessions.ts). Beside the user's own hooks, not
// instead of them. Every pane the app opens carries DASHBOARD_BOARD.
export const BOARD_GUARD_HOOKS = {
  PreToolUse: [{ matcher: GUARDED_TOOLS, hooks: [{ type: 'command' as const, command: 'node "$DASHBOARD_BOARD" guard' }] }],
};

// A card file, the columns file, or the older board.json, at any depth and with either separator.
// `.dashboard/notes.md` and `.dashboard/CLAUDE.md` are not the board and stay editable.
const BOARD_PATH = String.raw`(?:^|[\\/])\.dashboard[\\/]board(?:[\\/]|\.json(?![\w.]))`;
const BOARD_FILE = new RegExp(BOARD_PATH);

// A board path as the target of `>`, `>>`, `tee` or `sed -i`. A board file read (`cat`, `jq`, `git
// show`) or put back from git (`git checkout origin/main -- .dashboard/`) is left alone: the first
// changes nothing and the second is how a merge conflict on the board is resolved.
// ponytail: an `mv tmp .dashboard/board/…`, a `python -c` or an editor in a pane still gets through;
// matching those means parsing the shell, and the hook is a guard rail, not a sandbox.
const TARGET = String.raw`\s*["']?(?:[^\s"';|&<>]*[\\/])?\.dashboard[\\/]board(?:[\\/]|\.json(?![\w.]))`;
const SHELL_WRITE = new RegExp(String.raw`(?:>>?|\btee(?:\s+-a)?|\bsed\b[^;|&]*\s-i[^;|&]*\s)${TARGET}`);

function fieldOf(input: unknown, field: string): unknown {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[field] : undefined;
}

export function writesBoard(toolName: string, toolInput: unknown): boolean {
  const field = Object.hasOwn(FILE_FIELDS, toolName) ? FILE_FIELDS[toolName] : undefined;
  const value = fieldOf(toolInput, field ?? 'command');
  if (typeof value !== 'string') return false;
  if (field !== undefined) return BOARD_FILE.test(value);
  return toolName === 'Bash' && SHELL_WRITE.test(value);
}

// The refusal Claude reads, naming the command as the caller can run it: `$DASHBOARD_BOARD` in a pane
// the app opened, the program's own path outside one.
export function boardGuardReason(boardCommand: string): string {
  return `The board's files are written only by the board command, so every card keeps the fields the app expects. `
    + `Run \`node "${boardCommand}"\` with no arguments for its usage: move, set, comment, add.`;
}

// The hook's answer, the same object from an SDK callback and from a command's stdout; undefined lets
// the call through.
export function boardGuard(toolName: string, toolInput: unknown, boardCommand: string) {
  if (!writesBoard(toolName, toolInput)) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'deny' as const,
      permissionDecisionReason: boardGuardReason(boardCommand),
    },
  };
}
