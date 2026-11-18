import { describe, expect, it } from 'vitest';
import { BOARD_FILE_PATH, BOARD_FOLDER_PATH, BOARD_PATHSPECS } from '../src/main/board/board-store';
import { BOARD_FILE, BOARD_FOLDER, BOARD_PATHSPEC, boardRefusal } from './board-unchanged.mjs';

describe('boardRefusal', () => {
  it('looks at the paths the board is written to and read from', () => {
    expect(BOARD_FOLDER).toBe(`${BOARD_FOLDER_PATH}/`);
    expect(BOARD_FILE).toBe(BOARD_FILE_PATH);
    expect(BOARD_PATHSPEC).toBe(BOARD_PATHSPECS[0]);
  });

  it('lets a pull request through that changes no board file, the seeded .dashboard docs included', () => {
    expect(boardRefusal(['src/main/main.ts', '.dashboard/CLAUDE.md', '.dashboard/README.md'], 'main')).toBe('');
  });

  it('refuses the old board.json', () => {
    expect(boardRefusal(['.dashboard/board.json'], 'main')).toContain('files: .dashboard/board.json.');
  });

  it('refuses a card file, naming it and saying how to restore the board from the merge-base', () => {
    expect(boardRefusal(['src/main/main.ts', '.dashboard/board/cards/c335c842.json'], 'main')).toBe(
      "This pull request changes the board's files: .dashboard/board/cards/c335c842.json. Every board write lands on main by itself, so a branch's copy is a stale one (workflow-rule-7). Leave the board to main: git fetch origin && git restore --source=\"$(git merge-base HEAD origin/main)\" --staged --worktree -- '.dashboard/board*' && git commit -m \"Leave the board to main\"",
    );
  });
});
