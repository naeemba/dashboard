import { describe, expect, it } from 'vitest';
import { runBoardCommand, formatList } from './board-cli';
import { USAGE } from './board-usage';
import { emptyBoard, cardById, type Board } from './board';

// Ids are handed in rather than generated, so a test can name the card it just made.
let counter = 0;
const makeId = (): string => `id-${(counter += 1)}`;

function run(board: Board, ...args: string[]) {
  return runBoardCommand(board, args, makeId);
}

function boardAfter(board: Board, ...args: string[]): Board {
  const result = run(board, ...args);
  if (!result.ok) throw new Error(result.message);
  return result.board ?? board;
}

function withCard(title = 'Ship it'): { board: Board; id: string } {
  const before = emptyBoard();
  const result = run(before, 'add', title);
  if (!result.ok || result.board === null) throw new Error('add failed');
  return { board: result.board, id: result.output.split('  ')[0] };
}

describe('list', () => {
  it('says so when there is nothing on the board', () => {
    expect(formatList(emptyBoard())).toBe('No cards.');
  });

  it('names the column, the priority and the id of every card', () => {
    const { board, id } = withCard('Ship it');
    const line = formatList(board);
    expect(line).toContain('Todo');
    expect(line).toContain('medium');
    expect(line).toContain(id);
    expect(line).toContain('Ship it');
  });

  it('puts the branch and the pull request after the title', () => {
    const { board, id } = withCard();
    const flying = boardAfter(board, 'set', id, '--branch', 'ship-it', '--pull-request', '14');
    expect(formatList(flying)).toContain('(ship-it · #14)');
  });

  it('writes nothing', () => {
    const { board } = withCard();
    const result = run(board, 'list');
    expect(result.ok && result.board).toBe(null);
  });
});

describe('add', () => {
  it('puts a card in the leftmost column', () => {
    const { board, id } = withCard('Ship it');
    expect(board.columns[0].name).toBe('Todo');
    expect(board.columns[0].cards.map((card) => card.id)).toContain(id);
  });

  it('takes a column, a priority and notes', () => {
    const result = run(emptyBoard(), 'add', 'Ship it', '--column', 'Doing', '--priority', 'urgent', '--notes', 'why');
    expect(result.ok).toBe(true);
    if (!result.ok || result.board === null) return;
    const card = result.board.columns.find((column) => column.name === 'Doing')?.cards[0];
    expect(card?.priority).toBe('urgent');
    expect(card?.notes).toBe('why');
  });

  // The columns are named in prose. `board move <id> done` is what anyone types.
  it('matches a column name whatever its case', () => {
    const result = run(emptyBoard(), 'add', 'Ship it', '--column', 'doing');
    expect(result.ok).toBe(true);
  });

  // `board add --help` is an ordinary thing to try, and it was the one spelling of it that wrote: a
  // card called `--help`, in Todo, in a file the team commits.
  it('refuses a flag where the title should be', () => {
    expect(run(emptyBoard(), 'add', '--help'))
      .toEqual({ ok: false, message: 'add needs a title before its flags' });
    expect(run(emptyBoard(), 'add', '--notes', 'why'))
      .toEqual({ ok: false, message: 'add needs a title before its flags' });
  });

  it('refuses a title that is only spaces, the way a hand-written card is dropped', () => {
    const result = run(emptyBoard(), 'add', '   ');
    expect(result).toEqual({ ok: false, message: 'add needs a title' });
  });

  it('names the columns it does have when the one asked for is not there', () => {
    const result = run(emptyBoard(), 'add', 'Ship it', '--column', 'Backlog');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Todo');
    expect(result.message).toContain('Done');
  });
});

describe('move', () => {
  it('takes the card straight to the column named', () => {
    const { board, id } = withCard();
    const moved = boardAfter(board, 'move', id, 'Done');
    expect(cardById(moved, id)).toBeDefined();
    expect(moved.columns.find((column) => column.name === 'Done')?.cards[0].id).toBe(id);
  });

  // Writing the file anyway would bump its mtime, and main's watcher would redraw every board on
  // screen for a command that moved nothing.
  it('writes nothing when the card is already there', () => {
    const { board, id } = withCard();
    const result = run(board, 'move', id, 'Todo');
    expect(result.ok && result.board).toBe(null);
    expect(result.ok && result.output).toContain('already in Todo');
  });

  it('refuses an id no card has', () => {
    const { board } = withCard();
    expect(run(board, 'move', 'nobody', 'Done')).toEqual({ ok: false, message: 'no card with id nobody' });
  });
});

describe('set', () => {
  it('takes the branch, the pull request and the priority at once', () => {
    const { board, id } = withCard();
    const next = boardAfter(board, 'set', id, '--branch', 'ship-it', '--pull-request', '#14', '--priority', 'high');
    const card = cardById(next, id);
    expect(card?.branch).toBe('ship-it');
    expect(card?.pullRequest).toBe(14);
    expect(card?.priority).toBe('high');
  });

  it('clears a field given nothing', () => {
    const { board, id } = withCard();
    const flying = boardAfter(board, 'set', id, '--branch', 'ship-it', '--pull-request', '14');
    const cleared = boardAfter(flying, 'set', id, '--branch=', '--pull-request=');
    expect(cardById(cleared, id)?.branch).toBeUndefined();
    expect(cardById(cleared, id)?.pullRequest).toBeUndefined();
  });

  it('reads --name=value as well as --name value', () => {
    const { board, id } = withCard();
    expect(cardById(boardAfter(board, 'set', id, '--priority=low'), id)?.priority).toBe('low');
  });

  it('refuses a pull request that is not a number', () => {
    const { board, id } = withCard();
    const result = run(board, 'set', id, '--pull-request', '0x10');
    expect(result).toEqual({ ok: false, message: 'not a pull request number: 0x10' });
  });

  it('names the four levels when what was typed is not one', () => {
    const { board, id } = withCard();
    const result = run(board, 'set', id, '--priority', 'later');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('urgent, high, medium, low');
  });

  // `--branch --notes x` would otherwise clear the branch and swallow the notes, saying nothing.
  it('refuses a flag with no value after it', () => {
    const { board, id } = withCard();
    expect(run(board, 'set', id, '--branch')).toEqual({ ok: false, message: '--branch needs a value' });
  });

  it('refuses a flag it does not have', () => {
    const { board, id } = withCard();
    const result = run(board, 'set', id, '--title', 'Something else');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('--branch');
  });

  it("trims the notes it is given, the way the board's own box does", () => {
    const { board, id } = withCard();
    const next = boardAfter(board, 'set', id, '--notes', 'why it matters\n');
    expect(cardById(next, id)?.notes).toBe('why it matters');
  });

  it('refuses a set with nothing to set', () => {
    const { board, id } = withCard();
    expect(run(board, 'set', id)).toEqual({ ok: false, message: 'set needs something to set' });
  });

  it('moves updatedAt and leaves createdAt alone', () => {
    const { board, id } = withCard();
    const before = cardById(board, id);
    const next = boardAfter(board, 'set', id, '--priority', 'low');
    const after = cardById(next, id);
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.updatedAt).not.toBe(undefined);
  });
});

describe('the command itself', () => {
  it('prints the usage with no arguments at all', () => {
    expect(run(emptyBoard())).toEqual({ ok: true, output: USAGE, board: null });
  });

  it('prints the usage after refusing a command it does not have', () => {
    const result = run(emptyBoard(), 'delete', 'whatever');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('no such command: delete');
    expect(result.message).toContain(USAGE);
  });
});
