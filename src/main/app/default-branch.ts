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
  return `cannot work out which branch on ${remote} is the main one`;
}
