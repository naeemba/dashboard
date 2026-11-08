import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Whether a folder is a linked git worktree, from its own `.git`: a file reading
// `gitdir: <repository>/.git/worktrees/<name>`. A project's own checkout has a `.git` folder, which
// does not read as a file, and a submodule's `.git` file points into `.git/modules/`, so neither is
// one. Asked of the files rather than the app's worktree records, which can miss the folder the
// command runs in: a worker's move into Review then asked the app to review a card it had no record
// of, and exited 1 after the move was written.
export function isLinkedWorktree(folder: string): boolean {
  try {
    return /^gitdir: .*[/\\]worktrees[/\\][^/\\]+\s*$/.test(readFileSync(join(folder, '.git'), 'utf8'));
  } catch {
    return false;
  }
}
