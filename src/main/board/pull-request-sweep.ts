import { failureText } from '../../shared/errors/failure';

// When the app asks gh about a project's cards (board-decision-6): when a worker reports, when the
// board is shown, and on a slow timer, all through `check`. pull-request-column.ts says which cards and
// what an answer does; card.follow does it.

// The slow timer, for a pull request merged or closed while nobody reported and nobody looked, and
// for the card's glyph to follow a check that finished (pull-request-status.ts).
export const FOLLOW_TIMER_MS = 60 * 1000;
// A check asked for within this long of the last one is skipped. Showing the board re-reads it after
// every write, the app's own included, and each read asking gh again would be a gh call per card per
// keystroke. What is skipped is caught by the timer.
export const FOLLOW_GAP_MS = 30 * 1000;

export type PullRequestSweepPorts = {
  // Whether the folder's board is a project's own (isProjectBoard): not the manager's, and not a
  // worktree's copy, whose writes would dirty a file tracked on the card's branch.
  projectBoard(projectPath: string): boolean;
  // The cards of the project worth asking about now (followedBranch), by id.
  followed(projectPath: string): string[];
  // card.follow for one card. Throws when gh cannot answer: missing, logged out or offline.
  follow(projectPath: string, id: string): Promise<unknown>;
  // One warning in the log, `board` kind.
  warn(projectPath: string, message: string): void;
  now(): number;
};

export type PullRequestSweep = { check(projectPath: string): Promise<void> };

export function pullRequestSweep(ports: PullRequestSweepPorts): PullRequestSweep {
  // When each project was last checked, from the moment the check began, and the ones still running.
  const checked = new Map<string, number>();
  const running = new Set<string>();
  // Projects told gh failed and not told since: one warning until a check goes through.
  const warned = new Set<string>();

  async function check(projectPath: string): Promise<void> {
    if (!ports.projectBoard(projectPath) || running.has(projectPath)) return;
    const now = ports.now();
    if (now - (checked.get(projectPath) ?? -Infinity) < FOLLOW_GAP_MS) return;
    checked.set(projectPath, now);
    running.add(projectPath);
    try {
      // One card at a time, and the first gh failure ends the check: offline, every card would fail
      // the same way.
      for (const id of ports.followed(projectPath)) await ports.follow(projectPath, id);
      warned.delete(projectPath);
    } catch (error: unknown) {
      if (!warned.has(projectPath)) ports.warn(projectPath, `pull requests not checked, no card moved: ${failureText(error)}`);
      warned.add(projectPath);
    } finally {
      running.delete(projectPath);
    }
  }

  return { check };
}
