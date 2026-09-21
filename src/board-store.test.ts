import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Lets one test stand in a fake home directory without touching the real one, since Vitest cannot
// spy on a named ESM export directly.
let homedirOverride: string | undefined;
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => homedirOverride ?? actual.homedir() };
});
import {
  BOARD_DIRECTORY,
  BOARD_FILE_PATH,
  BROKEN_BOARD_FILE,
  EXPLANATION_FOR_AGENTS,
  EXPLANATION_FOR_PEOPLE,
  parseBoard,
  projectRoot,
  readBoard,
  seedBoardDirectory,
  writeBoard,
} from './board-store';

// realpath, because on macOS the temporary folder is reached through a symlink and projectRoot
// resolves it — a raw mkdtemp path would not compare equal to the answer.
function project(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'dashboard-board-')));
}

function writeRaw(projectPath: string, text: string): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  writeFileSync(join(projectPath, BOARD_DIRECTORY, 'board.json'), text);
}

const columnNames = (board: { columns: { name: string }[] }) => board.columns.map((column) => column.name);

describe('BOARD_FILE_PATH', () => {
  it('is the board, relative to the project', () => {
    expect(BOARD_FILE_PATH).toBe('.dashboard/board.json');
  });
});

describe('projectRoot', () => {
  it('walks up to the folder that holds the board', () => {
    const root = project();
    mkdirSync(join(root, BOARD_DIRECTORY));
    const deep = join(root, 'src', 'views');
    mkdirSync(deep, { recursive: true });
    expect(projectRoot(deep)).toBe(root);
  });

  it('falls back to the repository when the project has no board yet', () => {
    const root = project();
    mkdirSync(join(root, '.git'));
    const deep = join(root, 'src');
    mkdirSync(deep);
    expect(projectRoot(deep)).toBe(root);
  });

  it('answers the directory itself when there is neither above it', () => {
    const root = project();
    expect(projectRoot(root)).toBe(root);
  });

  // The manager's own .dashboard (dashboard-folder.ts) sits directly in the home directory. Without
  // this boundary, a folder under $HOME that is neither a repository nor has a board of its own would
  // climb all the way there and be handed the manager's folder as if it were its project.
  it('never climbs into the home directory itself', () => {
    const home = project();
    mkdirSync(join(home, BOARD_DIRECTORY));
    const deep = join(home, 'Downloads', 'stray');
    mkdirSync(deep, { recursive: true });
    homedirOverride = home;
    try {
      expect(projectRoot(deep)).toBe(deep);
    } finally {
      homedirOverride = undefined;
    }
  });
});

describe('parseBoard', () => {
  it('reads a well-formed board', () => {
    const board = parseBoard('{"columns":[{"name":"Later","cards":[{"id":"1","title":"a","notes":"n"}]}]}');
    expect(board.columns).toEqual([
      { name: 'Later', cards: [{ id: '1', title: 'a', notes: 'n', priority: 'medium', parent: null }] },
      { name: 'Ship', cards: [] },
      { name: 'Review', cards: [] },
    ]);
  });

  it('keeps a parent that names a card on the board', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a"},{"id":"2","title":"b","parent":"1"}]}]}');
    expect(board.columns[0].cards.map((card) => card.parent)).toEqual([null, '1']);
  });

  it('reads a comment trail, oldest first', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","comments":['
      + '{"at":"2026-01-01T00:00:00.000Z","body":"first"},{"at":"2026-02-01T00:00:00.000Z","body":"second"}]}]}]}');
    expect(board.columns[0].cards[0].comments).toEqual([
      { at: '2026-01-01T00:00:00.000Z', body: 'first' },
      { at: '2026-02-01T00:00:00.000Z', body: 'second' },
    ]);
  });

  // A line someone wrote into the file by hand. Stamping it on read would have it claim the moment
  // the app first opened the board.
  it('keeps a comment written without a date', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","comments":[{"body":"by hand"}]}]}]}');
    expect(board.columns[0].cards[0].comments).toEqual([{ body: 'by hand' }]);
  });

  it('drops a comment with nothing in it and keeps the rest', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","comments":['
      + '{"body":"  "},{"at":"2026-01-01T00:00:00.000Z"},"not a comment",{"body":" kept "}]}]}]}');
    expect(board.columns[0].cards[0].comments).toEqual([{ body: 'kept' }]);
  });

  // A card that has never been commented on must be written back without the field, or every board
  // grows one the first time this version reads it.
  it('reads a card with no comments, and one whose comments are all rubbish, as having none', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":['
      + '{"id":"1","title":"a"},{"id":"2","title":"b","comments":[]},{"id":"3","title":"c","comments":"soon"}]}]}');
    expect(board.columns[0].cards.map((card) => card.comments)).toEqual([undefined, undefined, undefined]);
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

  it('reads the branch, the pull request and the timestamps', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a",'
      + '"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-03-01T00:00:00.000Z",'
      + '"branch":"fix-the-picker","pullRequest":14}]}]}');
    expect(board.columns[0].cards[0]).toMatchObject({
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      branch: 'fix-the-picker',
      pullRequest: 14,
    });
  });

  // A board written before these fields existed. Filled in on read, every card would claim to have
  // been created the first time this version opened the file.
  it('leaves a card without them unknown rather than stamping it', () => {
    const card = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"}]}]}').columns[0].cards[0];
    expect(card.createdAt).toBe(undefined);
    expect(card.updatedAt).toBe(undefined);
    expect(card.branch).toBe(undefined);
    expect(card.pullRequest).toBe(undefined);
  });

  it('drops a pull request that is not a whole number above zero', () => {
    for (const written of ['"#14"', '0', '-3', '1.5', 'null']) {
      const board = parseBoard(`{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","pullRequest":${written}}]}]}`);
      expect(board.columns[0].cards[0].pullRequest).toBe(undefined);
    }
  });

  // An empty branch would otherwise draw an empty line under the card.
  it('reads a blank branch as no branch', () => {
    const board = parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a","branch":"  "}]}]}');
    expect(board.columns[0].cards[0].branch).toBe(undefined);
  });

  // Without this, every card on this repo's own board grows four nulls it never had.
  it('writes nothing for the fields a card does not have', () => {
    const projectPath = project();
    writeBoard(projectPath, parseBoard('{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"}]}]}'));
    const written = readFileSync(join(projectPath, BOARD_DIRECTORY, 'board.json'), 'utf8');
    expect(written).not.toContain('createdAt');
    expect(written).not.toContain('pullRequest');
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
    expect(columnNames(board)).toEqual(['Todo', 'Ship', 'Review']);
    expect(board.columns[0].cards.map((card) => card.title)).toEqual(['a']);
  });

  it('fills in a missing cards array and missing notes', () => {
    const board = parseBoard('{"columns":[{"name":"Todo"},{"name":"Doing","cards":[{"id":"1","title":"a"}]}]}');
    expect(board.columns[0].cards).toEqual([]);
    expect(columnNames(board)).toEqual(['Todo', 'Ship', 'Doing', 'Review']);
    expect(board.columns[2].cards[0].notes).toBe('');
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

  // The generated id is a card id like any other, so the card further down that already carries it
  // has to be moved off it too. Otherwise splitting one pair just makes another.
  it('gives a fresh id that a later card already carries', () => {
    let issued = 0;
    const board = parseBoard(
      '{"columns":[{"name":"Todo","cards":[{"id":"1","title":"a"},{"id":"1","title":"b"},'
      + '{"id":"fresh-1","title":"c"}]}]}',
      () => `fresh-${++issued}`,
    );
    expect(board.columns[0].cards.map((card) => card.id)).toEqual(['1', 'fresh-1', 'fresh-2']);
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
    expect(columnNames(readBoard(project()).board)).toEqual(['Todo', 'Ship', 'Doing', 'Review', 'Done']);
  });

  it('reads back what writeBoard wrote', () => {
    const path = project();
    writeBoard(path, {
      columns: [{ name: 'Later', cards: [{ id: '1', title: 'a', notes: '', priority: 'medium', parent: null }] }],
    });
    expect(columnNames(readBoard(path).board)).toEqual(['Later', 'Ship', 'Review']);
  });

  it('survives a damaged file', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    expect(columnNames(readBoard(path).board)).toEqual(['Todo', 'Ship', 'Doing', 'Review', 'Done']);
  });

  // A missing file is not damage: there is nothing to salvage, so no .broken file appears.
  it('does not treat a missing file as broken', () => {
    const path = project();
    expect(readBoard(path).brokenFile).toBeNull();
    expect(existsSync(join(path, BOARD_DIRECTORY, BROKEN_BOARD_FILE))).toBe(false);
  });

  // A folder stands in for every errno that is not ENOENT — EMFILE, EIO, EACCES — because it is the
  // only one a test can make on demand.
  it('throws rather than reading an empty board when board.json is a folder', () => {
    const path = project();
    mkdirSync(join(path, BOARD_FILE_PATH), { recursive: true });
    expect(() => readBoard(path)).toThrow(/EISDIR/);
  });

  it('moves a damaged file aside and says where it went', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    const brokenPath = join(path, BOARD_DIRECTORY, BROKEN_BOARD_FILE);
    const result = readBoard(path);
    expect(result.brokenFile).toBe(brokenPath);
    expect(readFileSync(brokenPath, 'utf8')).toBe('{"columns": [');
  });

  // A folder where the .broken file has to go: the only way to make the salvage rename fail on demand.
  it('throws when a damaged file cannot be moved aside', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    mkdirSync(join(path, BOARD_DIRECTORY, BROKEN_BOARD_FILE), { recursive: true });
    expect(() => readBoard(path)).toThrow();
  });

  it('takes the plain no-file path on the read after a salvage', () => {
    const path = project();
    writeRaw(path, '{"columns": [');
    readBoard(path);
    expect(existsSync(join(path, BOARD_DIRECTORY, 'board.json'))).toBe(false);
    const second = readBoard(path);
    expect(second.brokenFile).toBeNull();
    expect(columnNames(second.board)).toEqual(['Todo', 'Ship', 'Doing', 'Review', 'Done']);
  });

  it('gives a three-column board read from disk its Ship and Review columns', () => {
    const path = project();
    writeRaw(path, JSON.stringify({
      columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }, { name: 'Done', cards: [] }],
    }));
    expect(columnNames(readBoard(path).board)).toEqual(['Todo', 'Ship', 'Doing', 'Review', 'Done']);
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

  it('writes a doc missing from a folder that is already there', () => {
    const path = project();
    mkdirSync(join(path, BOARD_DIRECTORY), { recursive: true });
    seedBoardDirectory(path);
    expect(readFileSync(join(path, BOARD_DIRECTORY, 'CLAUDE.md'), 'utf8')).toContain('board.json');
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
