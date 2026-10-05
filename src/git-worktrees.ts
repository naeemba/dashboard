// Every worktree git knows of for a project, not only the ones a ship made. worktrees.json holds the
// app's own, with a card and a pane; this is what git itself says, so a worktree an agent session made,
// or one made by hand, shows up on the manager with the rest instead of sitting on disk unseen.

// How long a measured size is kept before the folder is measured again. Long, because a measure walks
// every file in the folder and a size that is five minutes old still says which worktree is the big one.
export const SIZE_STALE_MS = 300_000;

export type GitWorktree ={ projectPath: string; worktreePath: string; branch: string };

// What the manager's scan answers per worktree. `bytes` is null until the folder has been measured —
// a size is a walk of every file in it, so it arrives later than the rest.
export type ScannedWorktree = GitWorktree & { dirty: boolean; unreadable: boolean; bytes: number | null };

// `git worktree list --porcelain`: one block per worktree, blank-line separated, the project's own
// checkout first. That first block is the project itself, not a worktree of it, so it is skipped. A
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

// `du -sk <path>` prints `<kilobytes>\t<path>`. A folder with something unreadable in it still prints
// its total, after the complaints on stderr, so the number is read wherever the output came from.
export function diskUsageBytes(output: string): number | null {
  const kilobytes = Number.parseInt(output.trim().split(/\s/)[0] ?? '', 10);
  return Number.isNaN(kilobytes) ? null : kilobytes * 1024;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

// One decimal under ten and none above it, so the column stays short: `840 MB`, `2.3 GB`. `…` is a
// folder still being measured.
export function formatSize(bytes: number | null): string {
  if (bytes === null) return '…';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
