// CI's check that a pull request leaves the board's files alone (workflow-rule-7). The entry is
// scripts/board-unchanged-step.mjs, kept apart so importing this file never runs the check.

// BOARD_FOLDER_PATH, BOARD_FILE_PATH and BOARD_PATHSPECS[0] in src/main/board/board-store.ts, which this
// file cannot import; the test ties them. The old board.json is still read, so a stale copy of it in a
// branch brings back cards main has deleted since.
export const BOARD_FOLDER = '.dashboard/board/';
export const BOARD_FILE = '.dashboard/board.json';
export const BOARD_PATHSPEC = '.dashboard/board*';

// Why the pull request is refused, or '' when none of the files it changes is the board's. The fix
// restores the board from the merge-base, not from the base: a copy of the base's board as of the fetch
// is still a change, and conflicts the next time main moves one of those cards.
export function boardRefusal(changedFiles, baseBranch) {
  const boardFiles = changedFiles.filter((file) => file === BOARD_FILE || file.startsWith(BOARD_FOLDER));
  if (boardFiles.length === 0) return '';
  return `This pull request changes the board's files: ${boardFiles.join(', ')}. Every board write lands on ${baseBranch} by itself, so a branch's copy is a stale one (workflow-rule-7). Leave the board to ${baseBranch}: git fetch origin && git restore --source="$(git merge-base HEAD origin/${baseBranch})" --staged --worktree -- '${BOARD_PATHSPEC}' && git commit -m "Leave the board to ${baseBranch}"`;
}
