import { describe, expect, it } from 'vitest';
import { boardGuard, writesBoard } from './board-guard';

const card = '/work/app/.dashboard/board/cards/0f6a2c5e.json';

describe('writesBoard', () => {
  it.each([
    ['Edit', { file_path: card }],
    ['Write', { file_path: '/work/app/.dashboard/board/columns.json' }],
    ['Write', { file_path: 'C:\\work\\app\\.dashboard\\board\\cards\\a.json' }],
    ['Edit', { file_path: '/work/app/.dashboard/board.json' }],
    ['NotebookEdit', { notebook_path: '.dashboard/board/cards/a.json' }],
  ])('refuses %s of a board file', (tool, input) => {
    expect(writesBoard(tool, input)).toBe(true);
  });

  it.each([
    ['Edit', { file_path: '/work/app/.dashboard/notes.md' }],
    ['Write', { file_path: '/work/app/.dashboard/CLAUDE.md' }],
    ['Edit', { file_path: '/work/app/.dashboard/board.json.broken' }],
    ['Edit', { file_path: '/work/app/src/main/board/board-store.ts' }],
    ['Read', { file_path: card }],
    ['Edit', { notebook_path: card }],
    ['Write', null],
  ])('lets %s of anything else through', (tool, input) => {
    expect(writesBoard(tool, input)).toBe(false);
  });

  it.each([
    `echo '{}' > ${card}`,
    'jq . a.json >> .dashboard/board/cards/a.json',
    'cat x | tee .dashboard/board/columns.json',
    'cat x | tee -a ".dashboard/board/columns.json"',
    "sed -i 's/Doing/Done/' .dashboard/board/cards/a.json",
    "sed -E -i.bak -e 's/a b/c/' ./.dashboard/board.json",
  ])('refuses the shell writing a board file: %s', (command) => {
    expect(writesBoard('Bash', { command })).toBe(true);
  });

  it.each([
    `cat ${card}`,
    'jq .column .dashboard/board/cards/a.json > /tmp/column',
    'git checkout origin/main -- .dashboard/',
    'git add -A -- .dashboard/board && git commit -m "board: move"',
    'node "$DASHBOARD_BOARD" move a Done 2>&1',
    'echo hi > .dashboard/notes.md',
    "sed -n '1p' .dashboard/board/cards/a.json",
  ])('lets the shell read the board: %s', (command) => {
    expect(writesBoard('Bash', { command })).toBe(false);
  });
});

describe('boardGuard', () => {
  it('denies with the board command named, and says nothing otherwise', () => {
    const output = boardGuard('Edit', { file_path: card }, '$DASHBOARD_BOARD');
    expect(output?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output?.hookSpecificOutput.permissionDecisionReason).toContain('node "$DASHBOARD_BOARD"');
    expect(boardGuard('Edit', { file_path: '/work/app/README.md' }, '$DASHBOARD_BOARD')).toBeUndefined();
  });
});
