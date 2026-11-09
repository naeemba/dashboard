import type { Refused } from '../../../shared/app/bridge';
import { baseName } from '../../../shared/app/base-name';
import { failureText } from '../../../shared/errors/failure';
import { action, isRefused } from '../action';
import { isFilledText } from './pane-input';

// `pane release`: the worker closed, unless what runs in it is somebody else's, and the throwaway
// worktree it was given removed once nothing in it is left unfinished. The asker's right to the pane
// is the command's to check first (session-requests.ts).

export type Throwaway = { worktreePath: string; projectPath: string };

export type PaneReleasePorts = {
  // What is running in the pane when something is, or null.
  busyWith(id: string): string | null;
  // Whether what runs there is main's worker, which release may kill. Anything else is somebody else's:
  // a dev server, a card a ship gave an agent.
  mainsWorker(id: string): boolean;
  // pane.close.
  close(id: string): Promise<{ output: string } | Refused>;
  // Everything the command held of the pane let go of, and the throwaway worktree it was given, if any.
  // That includes its stop notice, which `close` has already let go of as it dropped the pane: one still
  // waiting in main's queue is taken back, since main hears a report only once the turn that read it
  // ends, and that turn is the one releasing the worker (workers-decision-1).
  forget(id: string): Throwaway | undefined;
  // Whether the folder is still on disk. A merge can take it first: `gh pr merge --delete-branch`
  // removes the branch's worktree, and git spawned into a folder that is gone fails as `spawn git
  // ENOENT`, which read as the release failing when it had worked.
  exists(worktreePath: string): boolean;
  // `git worktree prune` from the project: a folder deleted by hand leaves git's registration behind,
  // which keeps its branch checked out nowhere. Only registrations whose folder is gone are touched, so
  // after a merge's own removal it does nothing.
  prune(projectPath: string): Promise<void>;
  // Why the worktree is kept, or null when nothing in it would be lost (finished-work.ts).
  unfinished(worktreePath: string): Promise<string | null>;
  removeWorktree(worktreePath: string, projectPath: string): Promise<void>;
};

export const paneRelease = action<PaneReleasePorts, { id: string }, { output: string }>('pane.release', {
  words: [],
  input: ({ id }) => (isFilledText(id) ? { id } : { refused: 'no pane was given' }),
  async run(ports, { id }) {
    const program = ports.busyWith(id);
    if (program !== null && !ports.mainsWorker(id)) return { refused: `${id} is running ${program}, which no session run started — close it by hand` };
    const closed = await ports.close(id);
    if (isRefused(closed)) return closed;
    // What close said past `closed <id>`, a scope it could not stop, is said here too.
    const closeNote = closed.output.slice(`closed ${id}`.length);
    const throwaway = ports.forget(id);
    if (throwaway === undefined) return { output: `released ${id}${closeNote}` };
    const folder = baseName(throwaway.worktreePath);
    if (!ports.exists(throwaway.worktreePath)) {
      // The pane is closed and the throwaway forgotten by now: a prune that fails, say because the
      // project folder is gone too, is said in the reply rather than failing a release that worked.
      const pruneNote = await ports.prune(throwaway.projectPath).then(
        () => '',
        (error: unknown) => ` (git worktree prune failed: ${failureText(error)})`,
      );
      return { output: `released ${id}; ${folder} was already removed${pruneNote}${closeNote}` };
    }
    const reason = await ports.unfinished(throwaway.worktreePath);
    if (reason !== null) return { output: `released ${id}${closeNote}; kept ${throwaway.worktreePath}: ${reason}` };
    await ports.removeWorktree(throwaway.worktreePath, throwaway.projectPath);
    return { output: `released ${id} and removed ${folder}${closeNote}` };
  },
});
