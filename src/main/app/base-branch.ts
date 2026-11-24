import { chosenRemote, defaultBranch, noDefaultBranchMessage } from './default-branch';
import { git, gitNowOrNull } from './git';

// Where a project's work is cut from and its board is written: a remote (chosenRemote's rule) and a
// branch on it (defaultBranch's rule: `<remote>/HEAD`, else main, else master, since `<remote>/HEAD`
// is not set in every clone). One answer for the ship, a dispatched task's worktree, the board's git
// sync and the seeded docs, so none of them cuts from or writes to a branch the others do not. A
// project whose base is none of those names it with `project set --base`, which sets `<remote>/HEAD`
// (git remote set-head): every reader of it, these and the skills' `git symbolic-ref`, then agrees.
export type BaseBranch = { remote: string; branch: string };

const lines = (text: string | null): string[] => (text ?? '').split('\n').filter((line) => line !== '');

const upstreamQuestion = (current: string): string[] => ['config', '--get', `branch.${current}.remote`];
const headQuestion = (remote: string): string[] => ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`];
const branchQuestion = (remote: string, name: string): string[] => ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${name}`];
const REMOTES = ['remote'];
const CURRENT = ['symbolic-ref', '--short', '-q', 'HEAD'];

export async function projectRemote(folder: string): Promise<string> {
  const answer = (gitArguments: string[]) => git(gitArguments, folder).catch(() => null);
  const [remotes, current] = await Promise.all([answer(REMOTES), answer(CURRENT)]);
  return chosenRemote(current === null ? null : await answer(upstreamQuestion(current)), lines(remotes));
}

export async function baseBranch(folder: string): Promise<BaseBranch> {
  const answer = (gitArguments: string[]) => git(gitArguments, folder).catch(() => null);
  const remote = await projectRemote(folder);
  const [head, main, master] = await Promise.all([
    answer(headQuestion(remote)), answer(branchQuestion(remote, 'main')), answer(branchQuestion(remote, 'master')),
  ]);
  const branch = defaultBranch(remote, head, (name) => (name === 'main' ? main : master) !== null);
  if (branch === null) throw new Error(noDefaultBranchMessage(remote));
  return { remote, branch };
}

// The same three, blocking: for a caller that is synchronous itself (seeding a board's docs, the
// create-task program) and asks only of local refs. defaultBranchNow takes the remote, so a caller
// told which one (create-task's --remote) asks of that one.
export function projectRemoteNow(folder: string): string {
  const answer = (gitArguments: string[]) => gitNowOrNull(gitArguments, folder);
  const current = answer(CURRENT);
  return chosenRemote(current === null ? null : answer(upstreamQuestion(current)), lines(answer(REMOTES)));
}

export function defaultBranchNow(folder: string, remote: string): string | null {
  const answer = (gitArguments: string[]) => gitNowOrNull(gitArguments, folder);
  return defaultBranch(remote, answer(headQuestion(remote)), (name) => answer(branchQuestion(remote, name)) !== null);
}

// null where baseBranch throws.
export function baseBranchNow(folder: string): BaseBranch | null {
  const remote = projectRemoteNow(folder);
  const branch = defaultBranchNow(folder, remote);
  return branch === null ? null : { remote, branch };
}
