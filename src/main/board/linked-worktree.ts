import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { worktreesRoot } from '../ship/ship';

// Whether a folder is one of the app's worktrees, from its own `.git`: a file reading
// `gitdir: <checkout>/.git/worktrees/<name>`, and the folder sitting in worktreesRoot(<checkout>). A
// project's own checkout has a `.git` folder, which does not read as a file, and a submodule's `.git`
// file points into `.git/modules/`, so neither is one. Nor is a bare repository's checkout
// (`gitdir: <repository>.git/worktrees/<name>`, no `.git` folder before `worktrees`), which can be a
// project in its own right: it keeps Ship and Review. Asked of the files because the app's worktree
// records can miss the folder: a worker's move into Review then asked the app to review a card it had
// no record of, and exited 1 after the move was written. The command asks it before asking the app
// anything, and isProjectBoard asks it as well. Both sides go through realpathSync, as git writes the
// gitdir with symlinks resolved and the folder may arrive without.
export function isLinkedWorktree(folder: string): boolean {
  try {
    const checkout = /^gitdir: (.*)[/\\]\.git[/\\]worktrees[/\\]/.exec(readFileSync(join(folder, '.git'), 'utf8'))?.[1];
    if (checkout === undefined) return false;
    return dirname(realpathSync(folder)) === realpathSync(worktreesRoot(checkout));
  } catch {
    return false;
  }
}
