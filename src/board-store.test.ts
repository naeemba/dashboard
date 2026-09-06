import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOARD_DIRECTORY,
  BROKEN_BOARD_FILE,
  EXPLANATION_FOR_AGENTS,
  EXPLANATION_FOR_PEOPLE,
  parseBoard,
  readBoard,
  seedBoardDirectory,
  writeBoard,
} from './board-store';

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
    expect(board.columns)
      .toEqual([{ name: 'Later', cards: [{ id: '1', title: 'a', notes: 'n', priority: 'medium', parent: null }] }]);
  });

  it('keeps a parent that names a card on the board', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a"},{"id":"2","title":"b","parent":"1"}]}]}');
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, '1']);
  });

  // A board written before subtasks existed. Every card is top-level, which is what it is.
  it('reads a card with no parent field as top-level', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  // The parent was deleted by hand, or the id was mistyped. Losing one relationship is the right
  // price; throwing would cost the whole board, which readBoard would then move aside.
  it('drops a parent that names no card', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":"nobody"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  it('drops a parent that is not a string', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":7}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  it('refuses to let a card be its own parent', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","parent":"1"}]}]}');
    expect(board.columns[0].cards[0].parent).toBe(null);
  });

  // Without this, drawing the board or counting a card's children recurses until the stack runs out.
  it('breaks a ring of parents', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a","parent":"2"},{"id":"2","title":"b","parent":"3"},'
      + '{"id":"3","title":"c","parent":"1"}]}]}');
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, null, null]);
  });

  // readBoard turns each of these into the empty board and moves the file aside; parseBoard's job is
  // only to say "this is not a board", loudly enough that readBoard can tell it apart from no file.
  it('throws on anything that is not a board', () => {
    expect(() => parseBoard('not json at all')).toThrow();
    expect(() => parseBoard('[]')).toThrow();
    expect(() => parseBoard('{"columns":"nope"}')).toThrow();
    expect(() => parseBoard('{"columns":[]}')).toThrow();
  });

  // A blank title counts as no title: kept, it would be a card you cannot see but can still select.
  it('drops a column with no name and a card with no title', () => {
    const board = parseBoard('{"columns":[{"cards":[]},{"name":"Todo","cards":[{"id":"1"},{"id":"2","title":"  "},{"id":"3","title":"a"}]}]}');
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
  // A hand-edited file is the likely source of a priority that is not one, and losing the card over it
  // would be worse than losing the colour.
  it('reads a priority back, and falls to medium for one it does not know', () => {
    const stored = '{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a","priority":"urgent"},'
      + '{"id":"2","title":"b","priority":"screaming"},'
      + '{"id":"3","title":"c"}]}]}';
    expect(parseBoard(stored).columns[0].cards.map((card) => card.priority))
      .toEqual(['urgent', 'medium', 'medium']);
  });

  it('gives a card without an id one of its own', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"title":"a"}]}]}', () => 'generated');
    expect(board.columns[0].cards[0])
      .toEqual({ id: 'generated', title: 'a', notes: '', priority: 'medium', parent: null });
  });

  // Copying the block above is how a similar card gets hand-written, and that copies the id. Left
  // alone, `d` on either copy deletes both while the confirmation names one.
  it('gives the second card with a taken id a fresh one', () => {
    const board = parseBoard(
      '{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"}]},{"name":"Doing","cards":[{"id":"1","title":"b"}]}]}',
      () => 'generated',
    );
    expect(board.columns.flatMap((column) => column.cards).map((card) => card.id)).toEqual(['1', 'generated']);
  });

  // The first copy keeps the id, so a parent written against it still names a card on the board.
  it('leaves a parent pointing at the first copy alone', () => {
    const board = parseBoard(
      '{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"},{"id":"1","title":"b"},'
      + '{"id":"2","title":"c","parent":"1"}]}]}',
      () => 'generated',
    );
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, null, '1']);
  });
});

describe('readBoard', () => {
  it('returns an empty board when the project has no .dashboard folder', () => {
    expect(columnNames(readBoard(project()).board)).toEqual(['Todo', 'Doing', 'Done']);
  });

  it('reads back what writeBoard wrote', () => {
    const path = project();
    writeBoard(path, {
      columns: [{ name: 'Later', cards: [{ id: '1', title: 'a', notes: '', priority: 'medium', parent: null }] }],
    });
    expect(columnNames(readBoard(path).board)).toEqual(['Later']);
  });

  it('survives a damaged file', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    expect(columnNames(readBoard(path).board)).toEqual(['Todo', 'Doing', 'Done']);
  });

  // A missing file is not damage: there is nothing to salvage, so no .broken file appears.
  it('does not treat a missing file as broken', () => {
    const path = project();
    expect(readBoard(path).brokenFile).toBeNull();
    expect(existsSync(join(path, BOARD_DIRECTORY, BROKEN_BOARD_FILE))).toBe(false);
  });

  it('moves a damaged file aside and says where it went', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    const brokenPath = join(path, BOARD_DIRECTORY, BROKEN_BOARD_FILE);
    const result = readBoard(path);
    expect(result.brokenFile).toBe(brokenPath);
    expect(readFileSync(brokenPath, 'utf8')).toBe('{"columns": [');
  });

  it('takes the plain no-file path on the read after a salvage', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    readBoard(path);
    expect(existsSync(join(path, BOARD_DIRECTORY, 'board.json'))).toBe(false);
    const second = readBoard(path);
    expect(second.brokenFile).toBeNull();
    expect(columnNames(second.board)).toEqual(['Todo', 'Doing', 'Done']);
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

  it('leaves no temporary file behind once the rename lands', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [] }] });
    expect(existsSync(join(path, BOARD_DIRECTORY, 'board.json.tmp'))).toBe(false);
  });

  it('throws when the board cannot be written', () => {
    // A file where the folder should be: the write cannot succeed, and must say so rather than
    // pretend the cards were saved.
    const path = project();
    writeFileSync(join(path, BOARD_DIRECTORY), 'in the way');
    expect(() => writeBoard(path, { columns: [] })).toThrow();
  });

  it('keeps a parent through a write and a read', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [
      { id: '1', title: 'a', notes: '', priority: 'medium', parent: null },
      { id: '2', title: 'b', notes: '', priority: 'medium', parent: '1' },
    ] }] });
    expect(readBoard(path).board.columns[0].cards[1].parent).toBe('1');
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

// This repository has its own board, so its `.dashboard` docs are checked in — and seeding only writes
// a file that is not there, so the app will never refresh them. Add a field to a card above and every
// other project gets the new docs on first open while this one keeps the old text forever, which is the
// text an agent working on this codebase reads. This fails the moment the two drift apart.
describe('the .dashboard docs checked into this repository', () => {
  it('still say what a freshly seeded project would be told', () => {
    expect(readFileSync(join(BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toBe(EXPLANATION_FOR_AGENTS);
    expect(readFileSync(join(BOARD_DIRECTORY, 'README.md'), 'utf8')).toBe(EXPLANATION_FOR_PEOPLE);
  });
});
