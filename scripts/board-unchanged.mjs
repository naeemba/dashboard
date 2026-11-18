// CI's check that a pull request leaves the board's card files alone (workflow-rule-7). The entry is
// scripts/board-unchanged-step.mjs, kept apart so importing this file never runs the check.

// BOARD_FOLDER_PATH in src/main/board/board-store.ts, which this file cannot import; the test ties the two.
export const BOARD = '.dashboard/board/';

// Why the pull request is refused, or '' when none of the files it changes is the board's.
export function boardRefusal(changedFiles, baseBranch) {
  const cards = changedFiles.filter((file) => file.startsWith(BOARD));
  if (cards.length === 0) return '';
  return `This pull request changes the board's files: ${cards.join(', ')}. Every board write lands on ${baseBranch} by itself, so a branch's copy is a stale one (workflow-rule-7). Take ${baseBranch}'s copy: git fetch origin && git restore --source=origin/${baseBranch} --staged --worktree -- ${BOARD} && git commit -m "Take ${baseBranch}'s board"`;
}
