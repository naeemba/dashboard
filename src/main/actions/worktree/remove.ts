import type { WorktreeRemoval } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { removalEntry } from '../../../shared/app/log-entry';
import { action } from '../action';
import { isFilledText } from '../pane/pane-input';

// Every worktree the app removes: the worktree dialog's and the manager's `d`, pane.release's throwaway,
// and a reviewed card's, both the swap's and the merged one's. What a removal does — refused once with
// changes in it, the shells killed and the screens closed in a recorded one — is the keeper's
// (worktree-keeper.ts); what each door's removal is, is `removalOf`'s.

export type RemovalFrom = 'dialog' | 'release' | 'review';

const FROMS: readonly RemovalFrom[] = ['dialog', 'release', 'review'];

export type WorktreeRemoveInput = { worktreePath: string; projectPath: string | undefined; force: boolean; from: RemovalFrom };

export type WorktreeRemovePorts = {
  remove(worktreePath: string, force: boolean, projectPath: string | undefined): Promise<WorktreeRemoval>;
  queue<T>(projectPath: string, run: () => Promise<T>): Promise<T>;
  log(draft: LogDraft): void;
};

// Forced only when the dialog asks, after you have said yes to losing what is in it: release has already
// found nothing unfinished there, and a review never takes what an agent left uncommitted. Queued on the
// project, as a ship is, unless the caller holds the queue already: the review runs inside its own, and
// the queue is not re-entrant. Logged unless it is the review's, which writes its outcome on the card.
export function removalOf(from: RemovalFrom, force: boolean): { force: boolean; queued: boolean; logged: boolean } {
  return { force: from === 'dialog' && force, queued: from !== 'review', logged: from !== 'review' };
}

function read(raw: Record<string, unknown>): WorktreeRemoveInput | null {
  const { worktreePath, projectPath, force, from } = raw;
  if (!isFilledText(worktreePath) || !FROMS.includes(from as RemovalFrom)) return null;
  if (projectPath !== undefined && !isFilledText(projectPath)) return null;
  return { worktreePath, projectPath, force: force === true, from: from as RemovalFrom };
}

export const worktreeRemove = action<WorktreeRemovePorts, WorktreeRemoveInput, WorktreeRemoval & { output: string }>('worktree.remove', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the worktree to remove was not one the app could read' },
  async run(ports, { worktreePath, projectPath, force, from }) {
    const how = removalOf(from, force);
    const remove = () => ports.remove(worktreePath, how.force, projectPath);
    const removal = how.queued && projectPath !== undefined ? await ports.queue(projectPath, remove) : await remove();
    if (how.logged && projectPath !== undefined) ports.log(removalEntry(projectPath, worktreePath, removal));
    return { ...removal, output: removal.message };
  },
});
