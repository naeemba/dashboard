// Every worktree git knows of for a project, not only the ones a ship made. worktrees.json holds the
// app's own, with a card and a pane; this is what git itself says, so a worktree an agent session made,
// or one made by hand, shows up on the manager with the rest instead of sitting on disk unseen.

// How long a measured size is kept before the folder is measured again. Long, because a measure walks
// every file in the folder and a size that is five minutes old still says which worktree is the big one.
export const SIZE_STALE_MS = 300_000;

export type GitWorktree ={ projectPath: string; worktreePath: string; branch: string };

// A folder's size: null until it has been measured — a size is a walk of every file in it, so it
// arrives later than the rest — and `unmeasurable` when the walk gave no number, most often because
// the folder is gone. The two print differently, so a row that will never resolve does not read as
// one still being measured.
export type WorktreeSize = number | 'unmeasurable' | null;

// What the manager's scan answers per worktree.
export type ScannedWorktree = GitWorktree & { dirty: boolean; unreadable: boolean; bytes: WorktreeSize };

// `git worktree list --porcelain`: one block per worktree, blank-line separated, the repository's
// main checkout first, and that first block is skipped. A project that is itself a linked worktree
// comes back among the others; `distinctWorktrees` drops it with the rest of the open folders. A
// detached worktree has no branch line, and is named by the start of the commit it sits on.
export function parseWorktreeList(porcelain: string, projectPath: string): GitWorktree[] {
  return porcelain.split(/\n\n+/).slice(1).flatMap((block): GitWorktree[] => {
    const fields = new Map(block.split('\n').map((line) => {
      const space = line.indexOf(' ');
      return space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)];
    }));
    const worktreePath = fields.get('worktree');
    if (!worktreePath || fields.has('bare')) return [];
    const branch = fields.get('branch')?.replace(/^refs\/heads\//, '')
      ?? `detached ${(fields.get('HEAD') ?? '').slice(0, 7)}`;
    return [{ projectPath, worktreePath, branch }];
  });
}

// A worktree the app recorded: where it is, as the record spells it, and the project that made it.
export type WorktreeRecord = { projectPath: string; worktreePath: string };

// The worktrees of every open project, each once, under the path the app's own record spells it with.
// git prints real paths and a record holds the path built from the project path as the app was given
// it, so `records` is keyed by git's spelling and the renderer matches on the record's one string.
// Two open projects sharing a repository list the same worktrees. A recorded one goes to the project
// its record names, when that project listed it, so a card's row finds its own worktree; any other
// goes to the first project to list it, so no two rows share a path. `openFolders` are the open
// projects' own folders as git spells them: one of them is never offered as a worktree to remove,
// whichever project's listing it turns up in, or its shells would be left standing in nothing.
export function distinctWorktrees(
  listed: readonly GitWorktree[],
  records: ReadonlyMap<string, WorktreeRecord>,
  openFolders: ReadonlySet<string>,
): GitWorktree[] {
  const kept = new Map<string, GitWorktree>();
  for (const worktree of listed) {
    if (openFolders.has(worktree.worktreePath)) continue;
    const record = records.get(worktree.worktreePath);
    const worktreePath = record?.worktreePath ?? worktree.worktreePath;
    if (kept.has(worktreePath) && record?.projectPath !== worktree.projectPath) continue;
    kept.set(worktreePath, { ...worktree, worktreePath });
  }
  return [...kept.values()];
}

// `du -sk <path>` prints `<kilobytes>\t<path>`. A folder with something unreadable in it still prints
// its total, after the complaints on stderr, so the number is read wherever the output came from.
export function diskUsageBytes(output: string): number | null {
  const kilobytes = Number.parseInt(output.trim().split(/\s/)[0] ?? '', 10);
  return Number.isNaN(kilobytes) ? null : kilobytes * 1024;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

// One decimal under ten and none above it, so the column stays short: `840 MB`, `2.3 GB`. `…` is a
// folder still being measured, `?` one that could not be.
export function formatSize(bytes: WorktreeSize): string {
  if (bytes === null) return '…';
  if (bytes === 'unmeasurable') return '?';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
