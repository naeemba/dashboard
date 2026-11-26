// Whether a pull request's review loop already finished at its head commit: what keeps the sweep from
// starting a second review of a card that waits in Review because merging is off (ship-decision-1).
// The sweep's own mark lasts one run, so without this every app restart re-cut the worktree and ran
// /pr-loop again at a pull request whose loop had converged hours before.
//
// The signal is the comment /pr-loop leaves on the pull request when it ends, `Review loop finished:
// <status>`, read off GitHub rather than the card: the card's line is the review agent's own words.
// A commit dated after that comment is work the loop has not seen, so it is reviewed again. The date
// is the commit's own committer date, not when it reached the pull request: a commit made before the
// comment and pushed after it reads as seen. On GitLab (forge.ts) /mr-loop leaves the same comment as
// a note on the merge request, read through glab's API in gh's shape.

import { projectForge } from '../app/forge';
import type { runProgram } from '../app/git';

// The argument list for the gh call whose output reviewFinishedAtHead reads.
function reviewViewArguments(pullRequest: number): string[] {
  return ['pr', 'view', String(pullRequest), '--json', 'comments,commits'];
}

export const FINISHED = 'Review loop finished:';

type View = { comments?: { body?: unknown; createdAt?: unknown }[]; commits?: { committedDate?: unknown }[] };

// `view` is gh's JSON. Anything it cannot read answers false: not knowing is the review going ahead,
// as it did before this was asked.
export function reviewFinishedAtHead(view: string): boolean {
  try {
    return finishedAtHead((JSON.parse(view) ?? {}) as View);
  } catch {
    return false;
  }
}

// The two glab calls whose answers mergeRequestFinishedAtHead reads: the merge request's notes, newest
// first, and its commits. `:id` is glab's for the project of the folder it runs in.
function mergeRequestReviewArguments(mergeRequest: number): [string[], string[]] {
  const path = `projects/:id/merge_requests/${mergeRequest}`;
  return [['api', `${path}/notes?sort=desc&per_page=100`], ['api', `${path}/commits?per_page=100`]];
}

type Note = { body?: unknown; created_at?: unknown };
type Commit = { committed_date?: unknown };

export function mergeRequestFinishedAtHead(notes: string, commits: string): boolean {
  try {
    const comments = listOf(JSON.parse(notes) as Note[]).map((note) => ({ body: note.body, createdAt: note.created_at }));
    return finishedAtHead({ comments, commits: listOf(JSON.parse(commits) as Commit[]).map((commit) => ({ committedDate: commit.committed_date })) });
  } catch {
    return false;
  }
}

// Asked of the project's forge; false when it cannot answer (offline, signed out, off the VPN), which
// starts the review as before.
export async function reviewFinished(run: typeof runProgram, folder: string, pullRequest: number, timeout: number): Promise<boolean> {
  const ask = (program: string, words: string[]) => run(program, words, folder, { timeout });
  try {
    if ((await projectForge(folder, run)) === 'gitlab') {
      const [notes, commits] = await Promise.all(mergeRequestReviewArguments(pullRequest).map((words) => ask('glab', words)));
      return mergeRequestFinishedAtHead(notes, commits);
    }
    return reviewFinishedAtHead(await ask('gh', reviewViewArguments(pullRequest)));
  } catch {
    return false;
  }
}

function finishedAtHead(parsed: View): boolean {
  const finished = latest(listOf(parsed.comments)
    .filter((comment) => typeof comment.body === 'string' && comment.body.trimStart().startsWith(FINISHED))
    .map((comment) => comment.createdAt));
  const head = latest(listOf(parsed.commits).map((commit) => commit.committedDate));
  return finished !== null && head !== null && head <= finished;
}

// Only the elements that are objects: gh's JSON is read, not trusted, and a null element would throw.
function listOf<T extends object>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value.filter((element: unknown) => typeof element === 'object' && element !== null) : [];
}

// The newest of these timestamps in milliseconds, or null when none reads as one.
function latest(stamps: unknown[]): number | null {
  const times = stamps.map((stamp) => (typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN)).filter((time) => !Number.isNaN(time));
  return times.length === 0 ? null : Math.max(...times);
}
