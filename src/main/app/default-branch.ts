// Which branch on a remote is its default: `<remote>/HEAD` when the clone has it set, otherwise
// main, then master; null when it is none of them. One rule for every caller — the ship, a
// dispatched task (baseBranch in git.ts) and the create-task program — so a card is filed on the
// branch the work is cut from. `head` is what `git symbolic-ref --short refs/remotes/<remote>/HEAD`
// printed, or null when it is not set; `hasBranch` says whether `refs/remotes/<remote>/<name>` exists.
export function defaultBranch(remote: string, head: string | null, hasBranch: (name: string) => boolean): string | null {
  // The ref is always `<remote>/<branch>`; sliced rather than matched, since a `.` in a remote name
  // is any character to a regexp.
  if (head !== null && head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  return ['main', 'master'].find(hasBranch) ?? null;
}

export function noDefaultBranchMessage(remote: string): string {
  return `cannot work out which branch on ${remote} is the main one; name it with \`dashboard project set <project> --base <branch>\``;
}

// The remote a project's work is cut from and its board goes to: origin when there is one, else the
// only remote, else the one the local main (then master) tracks, else origin. Never the current
// branch's upstream: checking out a branch from another remote would move the board and the ship's
// base there until the next switch back. `remotes` is what `git remote` listed, `defaultUpstreams`
// what `git config branch.main.remote` and `branch.master.remote` printed (null when unset; `.` for
// a branch tracking a local one, so each is checked against `remotes`). A GitLab project kept on a
// remote called `gitlab` is cut from there rather than refused for having no origin.
export function chosenRemote(remotes: readonly string[], defaultUpstreams: readonly (string | null)[]): string {
  if (remotes.includes('origin')) return 'origin';
  if (remotes.length === 1) return remotes[0];
  return defaultUpstreams.find((upstream) => upstream !== null && remotes.includes(upstream)) ?? 'origin';
}
