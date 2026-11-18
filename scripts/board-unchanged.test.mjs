import { describe, expect, it } from 'vitest';
import { BOARD_FOLDER_PATH } from '../src/main/board/board-store';
import { BOARD, boardRefusal } from './board-unchanged.mjs';

describe('boardRefusal', () => {
  it("looks at the folder the board is written to", () => {
    expect(BOARD).toBe(`${BOARD_FOLDER_PATH}/`);
  });

  it('lets a pull request through that changes no board file, the seeded .dashboard docs included', () => {
    expect(boardRefusal(['src/main/main.ts', '.dashboard/CLAUDE.md', '.dashboard/README.md'], 'main')).toBe('');
  });

  it("refuses a card file, naming it and saying how to take the base's copy", () => {
    expect(boardRefusal(['src/main/main.ts', '.dashboard/board/cards/c335c842.json'], 'main')).toBe(
      "This pull request changes the board's files: .dashboard/board/cards/c335c842.json. Every board write lands on main by itself, so a branch's copy is a stale one (workflow-rule-7). Take main's copy: git fetch origin && git restore --source=origin/main --staged --worktree -- .dashboard/board/ && git commit -m \"Take main's board\"",
    );
  });
});
