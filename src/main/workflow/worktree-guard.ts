// The PreToolUse hook that keeps an agent inside its own worktree (workflow-decision-9). It refuses a
// `git worktree remove` of the folder the session runs in, which kills the session's own shell and
// leaves its pane in a folder that is gone, and an Edit, Write or NotebookEdit of a file in another
// worktree of the same repository, which writes over the work of whoever is in that one.
//
// It runs inside `board guard` (board-program.ts), beside the board guard and the running-app guard,
// so it reaches every door they do.
// ponytail: it reads the command's text. A `cd` is followed only when it comes earlier in the same
// command, `$PWD` and `~` are the only expansions read, and a link to a worktree is not resolved;
// matching more means running the shell, and this is a guard rail.

import os from 'node:os';
import path from 'node:path';
import { FILE_FIELDS, hookRefusal, invocation, simpleCommands, textField } from '../board/hook-answer';
import { isInside } from '../panes/shell-directory';

// Every worktree of the repository `folder` is in, the main checkout included, or null outside one.
export type WorktreeList = (folder: string) => readonly string[] | null;

const REMOVE_REASON = 'This session runs in that worktree, and removing it kills this shell and leaves the pane '
  + "in a folder that is gone. Leave it: the app removes a card's worktree once the card is done, and the "
  + "user removes any other from the app's worktree list.";

const EDIT_REASON = 'That file is in another worktree of this repository, where another branch, and often another '
  + 'agent, is at work. Change files only in the worktree this session runs in.';

// A word of the command as a path from `base`, with `$PWD` and `~` read.
function resolveWord(word: string, base: string): string {
  const expanded = word.replace(/^(?:\$PWD|\$\{PWD\}|\$\(pwd\))(?=\/|$)/, base).replace(/^~(?=\/|$)/, os.homedir());
  return path.resolve(base, expanded);
}

// Whether a `git … worktree remove` in `command` names the folder `cwd` is in, or one holding it: each
// read from `cwd`, the `cd` before it and its `git -C`.
export function removesOwnWorktree(command: string, cwd: string): boolean {
  let base = cwd;
  return simpleCommands(command).some((part) => {
    const changed = invocation(part, 'cd');
    if (changed) base = resolveWord(changed.words[0] ?? '~', base);
    const words = invocation(part, 'git')?.words ?? [];
    // git's own flags, then its subcommand; `-C` and `-c` take a value.
    let from = base;
    let index = 0;
    for (; words[index]?.startsWith('-'); index += 1) {
      if (words[index] === '-C') from = resolveWord(words[index + 1] ?? '', from);
      if (words[index] === '-C' || words[index] === '-c') index += 1;
    }
    if (words[index] !== 'worktree' || words[index + 1] !== 'remove') return false;
    const target = words.slice(index + 2).find((word) => !word.startsWith('-'));
    return target !== undefined && isInside(cwd, resolveWord(target, from));
  });
}

// The worktree `file` is in: the deepest one holding it, so a worktree nested in the checkout
// (`.claude/worktrees/x`) is its own and not the checkout's.
const worktreeOf = (file: string, worktrees: readonly string[]) => worktrees
  .filter((worktree) => isInside(file, worktree))
  .reduce<string | undefined>((deepest, worktree) => (deepest === undefined || worktree.length > deepest.length ? worktree : deepest), undefined);

export function editsOtherWorktree(file: string, cwd: string, worktrees: readonly string[]): boolean {
  const own = worktreeOf(cwd, worktrees);
  const target = worktreeOf(path.resolve(cwd, file), worktrees);
  return own !== undefined && target !== undefined && own !== target;
}

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through. The
// worktrees are listed only for a file tool, so a Bash call runs no git.
export function worktreeGuard(toolName: string, toolInput: unknown, cwd: string, listWorktrees: WorktreeList) {
  if (cwd === '') return undefined;
  if (toolName === 'Bash') {
    return removesOwnWorktree(textField(toolInput, 'command'), cwd) ? hookRefusal(REMOVE_REASON) : undefined;
  }
  if (!Object.hasOwn(FILE_FIELDS, toolName)) return undefined;
  const file = textField(toolInput, FILE_FIELDS[toolName]);
  const worktrees = file === '' ? null : listWorktrees(cwd);
  return worktrees !== null && editsOtherWorktree(file, cwd, worktrees) ? hookRefusal(EDIT_REASON) : undefined;
}
