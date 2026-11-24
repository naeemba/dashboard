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

// The remote a project's work is cut from and its board goes to: the current branch's upstream when
// it has one on a remote, else the only remote, else origin. `upstream` is what `git config
// branch.<current>.remote` printed (`.` for a branch tracking a local one, so it is checked against
// `remotes`), `remotes` what `git remote` listed. A GitLab project kept on a remote called `gitlab`
// is cut from there rather than refused for having no origin.
export function chosenRemote(upstream: string | null, remotes: readonly string[]): string {
  if (upstream !== null && remotes.includes(upstream)) return upstream;
  return remotes.length === 1 ? remotes[0] : 'origin';
}
