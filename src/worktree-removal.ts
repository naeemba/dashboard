import type { DashboardBridge } from './bridge';
import { confirmOverlay } from './overlay';
import type { WorktreeEntry } from './worktree-store';

// Removing one worktree, asking first. Its own file because two screens remove worktrees — the
// worktree dialog and the manager's list — and a second copy of the questions is how one of them would
// come to force a removal the other only offers.
//
// `refocus` hands the keyboard back to whichever screen asked, after each sheet closes. A sheet takes
// focus while it is up, and without this the next arrow key goes nowhere.

// A notice with nothing to answer, built on the same sheet as the two questions so a refusal is read
// on the screen that asked, not off the status bar behind it.
export async function notify(message: string, refocus: () => void): Promise<void> {
  await confirmOverlay(message, 'Enter or Escape closes.');
  refocus();
}

// What the second question says: the files when main refused on uncommitted changes, main's own
// words for every other refusal. main decides what counts as dirty and hands the list back, so
// the question on screen cannot name one thing while the removal refuses on another.
function forcedQuestion(entry: WorktreeEntry, attempt: { message: string; dirty: string[] }): string {
  if (attempt.dirty.length === 0) return `${entry.branch} was not removed: ${attempt.message}`;
  const files = attempt.dirty.slice(0, 3).join(', ');
  const more = attempt.dirty.length > 3 ? ` and ${attempt.dirty.length - 3} more` : '';
  return `${entry.branch} has uncommitted changes: ${files}${more}.`;
}

// Asked twice, and the forced removal is offered whatever the first one failed on — not only on
// uncommitted changes. git counts files this app's dirty check exempts, everything gitignored
// among them, so a worktree the list calls clean is refused with `use --force to delete it`;
// without the offer here that worktree could never be removed from inside the app at all, and
// neither could one whose removal failed for any other reason.
export async function removeWorktreeAsking(
  bridge: DashboardBridge, entry: WorktreeEntry, refocus: () => void,
): Promise<void> {
  const first = await confirmOverlay(`Remove the worktree for "${entry.title}"?`,
    'Enter removes it. Escape keeps it. The folder and everything in it goes; the branch stays.');
  refocus();
  if (!first) return;
  // The row is read before the question and acted on after it, and five seconds is long enough for
  // an agent to remove its own worktree while the sheet is up. Nothing is re-checked here: a path
  // with no record is a removal that has already happened, and main answers it that way.
  const attempt = await bridge.removeWorktree(entry.worktreePath, false);
  if (attempt.ok) return;
  const forced = await confirmOverlay(forcedQuestion(entry, attempt),
    'Enter removes it anyway and loses what is in it. Escape keeps it.');
  refocus();
  if (!forced) return;
  const attemptForced = await bridge.removeWorktree(entry.worktreePath, true);
  if (!attemptForced.ok) await notify(attemptForced.message, refocus);
}
