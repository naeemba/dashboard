import { baseName } from '../../../shared/app/base-name';
import { failureText } from '../../../shared/errors/failure';

// What becomes of a throwaway worktree once no pane holds it: removed when nothing in it would be lost,
// kept with the reason otherwise. Every way its pane goes asks this: pane.release, a pane closed by
// hand or with its project (session-requests.ts's dropped), and the launch's worktree.sweep.

export type Throwaway = { worktreePath: string; projectPath: string };

export type ThrowawayPorts = {
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
  // worktree.remove `throwaway`, from release, a dropped pane and the sweep.
  removeWorktree(worktreePath: string, projectPath: string): Promise<void>;
};

export type LetGo =
  | { removed: string }
  // A prune that fails, say because the project folder is gone too, is said rather than thrown: the
  // folder is gone either way.
  | { gone: string; pruneNote: string }
  | { kept: string; reason: string };

export async function letGoOf(ports: ThrowawayPorts, { worktreePath, projectPath }: Throwaway): Promise<LetGo> {
  const folder = baseName(worktreePath);
  if (!ports.exists(worktreePath)) {
    const pruneNote = await ports.prune(projectPath).then(
      () => '',
      (error: unknown) => ` (git worktree prune failed: ${failureText(error)})`,
    );
    return { gone: folder, pruneNote };
  }
  const reason = await ports.unfinished(worktreePath);
  if (reason !== null) return { kept: worktreePath, reason };
  await ports.removeWorktree(worktreePath, projectPath);
  return { removed: folder };
}

// What happened, as a log line or a reply says it.
export function letGoText(outcome: LetGo): string {
  if ('removed' in outcome) return `removed ${outcome.removed}`;
  if ('gone' in outcome) return `${outcome.gone} was already removed${outcome.pruneNote}`;
  return `kept ${outcome.kept}: ${outcome.reason}`;
}

// The same for a door with nobody to answer: a git that fails keeps the worktree, and says so.
export function letGoAndSay(ports: ThrowawayPorts, throwaway: Throwaway): Promise<string> {
  return letGoOf(ports, throwaway).then(letGoText, (error: unknown) => `kept ${throwaway.worktreePath}: ${failureText(error)}`);
}
