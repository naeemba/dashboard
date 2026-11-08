import type { Channels } from '../app/channels';
import type { BoundAction } from '../actions/action';
import { scanWorktrees, worktreeState } from './worktree-scan';
import type { worktreeKeeper } from './worktree-keeper';

// The worktree dialog's and the manager's channels: the record, git's state of each worktree, the scan
// and a removal. Main-process wiring only, out of main.ts at its 600-line ceiling; main hands over the
// record it holds. A ship is the card.ship action's (actions/card/), a removal worktree.remove's.
export function registerWorktreeChannels(table: Channels, main: {
  worktrees: ReturnType<typeof worktreeKeeper>;
  remove: BoundAction;
}): void {
  const { worktrees } = main;
  // The renderer's first read, and the worktree dialog's own on the way open — the one screen that wants
  // a sweep run right now rather than on the next tick. Everything else arrives on worktree:change.
  table.handle('worktree:list', () => {
    worktrees.dropDead();
    return worktrees.list();
  });

  // A channel of its own rather than riding along on worktree:list and worktree:change, which reach the
  // renderer at launch and after every ship, removal and project close. A `git status` per worktree
  // behind all of those would be that many process spawns for an answer only the worktree dialog shows.
  //
  // worktreeState is git's own answer rather than the ship's narrower one, because git is what refuses
  // the removal this row's `d` is about to ask for. Run concurrently — this is main, and every pane's
  // bytes flow through it.
  table.handle('worktree:check', async () => {
    const results = await Promise.all(worktrees.entries().map(async (entry) => (
      { worktreePath: entry.worktreePath, ...await worktreeState(entry.worktreePath) }
    )));
    return {
      dirty: results.filter((result) => result.dirty).map((result) => result.worktreePath),
      unreadable: results.filter((result) => result.unreadable).map((result) => result.worktreePath),
    };
  });

  // Every worktree git knows of in each project, for the manager. worktree-scan.ts says what is in it.
  table.handle('worktree:scan', (_screen, projectPaths: string[]) => (
    scanWorktrees(projectPaths, worktrees.entries())
  ));

  table.handle('worktree:remove', (_screen, worktreePath: string, force: boolean, projectPath: string) => (
    main.remove.call({ worktreePath, force, projectPath, from: 'dialog' })
  ));
}
