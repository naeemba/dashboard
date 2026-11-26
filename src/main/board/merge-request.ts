import { projectForge } from '../app/forge';
import type { runProgram } from '../app/git';
import { latestListed, latestPullRequest, listedPullRequests, openPullRequestListArguments, pullRequestListArguments, type PullRequest } from './pull-request-column';

// A branch's pull request asked of the project's forge (forge.ts): `gh pr list`, or on GitLab `glab mr
// list`, whose merge requests are read into gh's shape here so the card records one the way it records
// a pull request: the iid as its number, the same opened, merged and closed lines, the same columns.

// `glab mr list` for one branch, every state, newest first.
function mergeRequestListArguments(branch: string): string[] {
  return ['mr', 'list', '--source-branch', branch, '--all', '--output', 'json', '--per-page', '20'];
}

const STATES: Record<string, string> = { opened: 'OPEN', merged: 'MERGED', closed: 'CLOSED' };

// GitLab's list says nothing of each check, only one merge status: what the card's glyph needs from it
// is put where pull-request-status.ts reads gh's. A failed pipeline says only `ci_must_pass`, which a
// pipeline not yet run says too, so it draws no glyph. A locked merge request has no state gh has and
// is dropped by latestListed, as an unknown gh state is.
function asPullRequest(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const { iid, state, title, web_url: url, sha, detailed_merge_status: status, source_branch: branch } = value as Record<string, unknown>;
  return {
    number: iid,
    headRefName: branch,
    state: typeof state === 'string' && Object.hasOwn(STATES, state) ? STATES[state] : null,
    title,
    url,
    headRefOid: sha,
    statusCheckRollup: status === 'ci_still_running' ? [{ state: 'PENDING' }] : [],
    mergeable: status === 'mergeable' ? 'MERGEABLE' : undefined,
  };
}

// The merge request a branch stands for, from `glab mr list`'s JSON, picked as latestPullRequest picks.
export function latestMergeRequest(json: string): PullRequest | null {
  return latestListed(asPullRequests(json));
}

function asPullRequests(json: string): unknown[] {
  const listed: unknown = JSON.parse(json);
  return Array.isArray(listed) ? listed.map(asPullRequest) : [];
}

// Throws when the forge's CLI cannot answer, as `gh pr list` alone did.
export async function branchPullRequest(run: typeof runProgram, folder: string, branch: string, timeout: number): Promise<PullRequest | null> {
  if ((await projectForge(folder, run)) === 'gitlab') {
    return latestMergeRequest(await run('glab', mergeRequestListArguments(branch), folder, { timeout }));
  }
  return latestPullRequest(await run('gh', pullRequestListArguments(branch), folder, { timeout }));
}

// A pull request open on the forge and the branch it is from, for `pane status`.
export type OpenPullRequest = { branch: string; pull: PullRequest };

// Every open pull request of the project, newest first, in one call. Throws as branchPullRequest does.
export async function openPullRequests(run: typeof runProgram, folder: string, timeout: number): Promise<OpenPullRequest[]> {
  const listed = (await projectForge(folder, run)) === 'gitlab'
    ? asPullRequests(await run('glab', ['mr', 'list', '--output', 'json', '--per-page', '100'], folder, { timeout }))
    : JSON.parse(await run('gh', openPullRequestListArguments(), folder, { timeout }));
  return listedPullRequests(listed).map((pull) => ({ branch: String(pull.headRefName ?? ''), pull }));
}
