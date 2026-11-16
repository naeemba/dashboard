// Whether a pull request's review loop already finished at its head commit: what keeps the sweep from
// starting a second review of a card that waits in Review because merging is off (ship-decision-1).
// The sweep's own mark lasts one run, so without this every app restart re-cut the worktree and ran
// /pr-loop again at a pull request whose loop had converged hours before.
//
// The signal is the comment /pr-loop leaves on the pull request when it ends, `Review loop finished:
// <status>`, read off GitHub rather than the card: the card's line is the review agent's own words.
// A commit after that comment is work the loop has not seen, so it is reviewed again.

// The argument list for the gh call whose output reviewFinishedAtHead reads.
export function reviewViewArguments(pullRequest: number): string[] {
  return ['pr', 'view', String(pullRequest), '--json', 'comments,commits'];
}

const FINISHED = 'Review loop finished:';

type View = { comments?: { body?: unknown; createdAt?: unknown }[]; commits?: { committedDate?: unknown }[] };

// `view` is gh's JSON. Anything it cannot read answers false: not knowing is the review going ahead,
// as it did before this was asked.
export function reviewFinishedAtHead(view: string): boolean {
  let parsed: View;
  try {
    parsed = (JSON.parse(view) ?? {}) as View;
  } catch {
    return false;
  }
  const finished = latest(listOf(parsed.comments)
    .filter((comment) => typeof comment.body === 'string' && comment.body.trimStart().startsWith(FINISHED))
    .map((comment) => comment.createdAt));
  const head = latest(listOf(parsed.commits).map((commit) => commit.committedDate));
  return finished !== null && head !== null && head <= finished;
}

function listOf<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

// The newest of these timestamps in milliseconds, or null when none reads as one.
function latest(stamps: unknown[]): number | null {
  const times = stamps.map((stamp) => (typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN)).filter((time) => !Number.isNaN(time));
  return times.length === 0 ? null : Math.max(...times);
}
