import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, parseBoard, readBoard, seedBoardDirectory, writeBoard } from './board-store';

function project(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-board-'));
}

function writeRaw(projectPath: string, text: string): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  writeFileSync(join(projectPath, BOARD_DIRECTORY, 'board.json'), text);
}

const columnNames = (board: { columns: { name: string }[] }) => board.columns.map((column) => column.name);

describe('parseBoard', () => {
  it('reads a well-formed board', () => {
    const board = parseBoard('{"columns":[{"name":"Later","cards":[{"id":"1","title":"a","notes":"n"}]}]}');
    expect(board.columns).toEqual([{ name: 'Later', cards: [{ id: '1', title: 'a', notes: 'n' }] }]);
  });

  // A file edited by hand or by an agent must never stop the board opening.
  it('falls back to an empty board on anything it cannot read', () => {
    expect(columnNames(parseBoard('not json at all'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('[]'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('{"columns":"nope"}'))).toEqual(['Todo', 'Doing', 'Done']);
    expect(columnNames(parseBoard('{"columns":[]}'))).toEqual(['Todo', 'Doing', 'Done']);
  });

  it('drops a column with no name and a card with no title', () => {
    const board = parseBoard('{"columns":[{"cards":[]},{"name":"Todo","cards":[{"id":"1"},{"id":"2","title":"a"}]}]}');
    expect(columnNames(board)).toEqual(['Todo']);
    expect(board.columns[0].cards.map((card) => card.title)).toEqual(['a']);
  });

  it('fills in a missing cards array and missing notes', () => {
    const board = parseBoard('{"columns":[{"name":"Todo"},{"name":"Doing","cards":[{"id":"1","title":"a"}]}]}');
    expect(board.columns[0].cards).toEqual([]);
    expect(board.columns[1].cards[0].notes).toBe('');
  });

  // An agent writing a card by hand will forget the id, and losing the card would be worse than
  // giving it one.
  it('gives a card without an id one of its own', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"title":"a"}]}]}', () => 'generated');
    expect(board.columns[0].cards[0]).toEqual({ id: 'generated', title: 'a', notes: '' });
  });
});

describe('readBoard', () => {
  it('returns an empty board when the project has no .dashboard folder', () => {
    expect(columnNames(readBoard(project()))).toEqual(['Todo', 'Doing', 'Done']);
  });

  it('reads back what writeBoard wrote', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Later', cards: [{ id: '1', title: 'a', notes: '' }] }] });
    expect(columnNames(readBoard(path))).toEqual(['Later']);
  });

  it('survives a damaged file', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    expect(columnNames(readBoard(path))).toEqual(['Todo', 'Doing', 'Done']);
  });
});

describe('writeBoard', () => {
  it('creates the folder and writes readable json', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [] }] });
    const text = readFileSync(join(path, BOARD_DIRECTORY, 'board.json'), 'utf8');
    expect(text).toContain('\n  "columns"');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('throws when the board cannot be written', () => {
    // A file where the folder should be: the write cannot succeed, and must say so rather than
    // pretend the cards were saved.
    const path = project();
    writeFileSync(join(path, BOARD_DIRECTORY), 'in the way');
    expect(() => writeBoard(path, { columns: [] })).toThrow();
  });
});

describe('seedBoardDirectory', () => {
  it('writes the two explanation files', () => {
    const path = project();
    seedBoardDirectory(path);
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toContain('board.json');
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'README.md'), 'utf8')).toContain('.dashboard');
  });

  it('never overwrites files that are already there', () => {
    const path = project();
    seedBoardDirectory(path);
    writeFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'mine');
    seedBoardDirectory(path);
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toBe('mine');
  });
});
