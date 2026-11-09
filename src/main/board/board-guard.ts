// The PreToolUse hook that keeps agents off the board's files (board-decision-8): an Edit, Write or
// NotebookEdit of a card file, or a shell command that redirects, tees or `sed -i`s into one, is refused
// with the command to use instead. What a hand edit costs is board-rule-1's: a card missing a field the
// app expects, repaired silently on the next read.
//
// One decision, run as `board guard` (board-program.ts) from every settings file that names the hook,
// beside the running-app guard (workflow/running-app-guard.ts), which rides the same command and doors:
// a terminal worker's, a Claude screen's, and the user's own ~/.claude/settings.json
// (board-guard-install.ts).

import { hookRefusal, SHELL_REDIRECT, textField } from './hook-answer';

// The tools whose input names the file they write, and the field it is in.
const FILE_FIELDS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

// What a hook's matcher has to let through for this to see every call it refuses.
const GUARDED_TOOLS = [...Object.keys(FILE_FIELDS), 'Bash'].join('|');

// The one command every door runs: the copy of the board program the app installs under ~/.claude
// (board-guard-install.ts). One string everywhere, so a session that has it from the user's
// settings.json and from the app's own settings runs it once: Claude Code drops identical commands.
export const GUARD_COMMAND = 'node "$HOME/.claude/dashboard/board.js" guard';

// The hook as a settings file names it: the user's settings.json, a terminal worker's --settings
// (dispatch.ts) and a Claude screen's (chat-sessions.ts), beside the user's own hooks.
export const GUARD_ENTRY = { matcher: GUARDED_TOOLS, hooks: [{ type: 'command' as const, command: GUARD_COMMAND }] };

export const BOARD_GUARD_HOOKS = { PreToolUse: [GUARD_ENTRY] };

// A card file, the columns file, or the older board.json, at any depth and with either separator.
// `.dashboard/notes.md` and `.dashboard/CLAUDE.md` are not the board and stay editable.
const BOARD_TAIL = String.raw`\.dashboard[\\/]board(?:[\\/]|\.json(?![\w.]))`;
const BOARD_FILE = new RegExp(String.raw`(?:^|[\\/])` + BOARD_TAIL);

// A board path as the target of `>`, `>>`, `tee` or `sed -i`. A board file read (`cat`, `jq`, `git
// show`) or put back from git (`git checkout origin/main -- .dashboard/`) is left alone: the first
// changes nothing and the second is how a merge conflict on the board is resolved.
// ponytail: an `mv tmp .dashboard/board/…`, a `python -c` or an editor in a pane still gets through;
// matching those means parsing the shell, and the hook is a guard rail, not a sandbox.
const TARGET = String.raw`\s*["']?(?:[^\s"';|&<>]*[\\/])?` + BOARD_TAIL;
const SHELL_WRITE = new RegExp(String.raw`(?:${SHELL_REDIRECT}|\bsed\b[^;|&]*\s-i[^;|&]*\s)${TARGET}`);

export function writesBoard(toolName: string, toolInput: unknown): boolean {
  if (Object.hasOwn(FILE_FIELDS, toolName)) return BOARD_FILE.test(textField(toolInput, FILE_FIELDS[toolName]));
  return toolName === 'Bash' && SHELL_WRITE.test(textField(toolInput, 'command'));
}

// The refusal Claude reads, naming the command as the caller can run it: `$DASHBOARD_BOARD` in a pane
// the app opened, the program's own path outside one.
function boardGuardReason(boardCommand: string): string {
  return `The board's files are written only by the board command, so every card keeps the fields the app expects. `
    + `Run \`node "${boardCommand}"\` with no arguments for its usage: move, set, comment, add.`;
}

// The hook's answer, as the command prints it on stdout; undefined lets the call through.
export function boardGuard(toolName: string, toolInput: unknown, boardCommand: string) {
  return writesBoard(toolName, toolInput) ? hookRefusal(boardGuardReason(boardCommand)) : undefined;
}
