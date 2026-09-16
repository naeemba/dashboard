import { describe, expect, it, vi } from 'vitest';
import { failureLine, runBoardCommand, runBoardCommandOnLatest, formatList } from './board-cli';
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

  // Without this the line for a card with twelve comments and the line for a card with none read the
  // same, and finding which cards have anything to read means running `show` on every one of them.
  it('says how many comments a card carries, and nothing when it carries none', () => {
    const { board, id } = withCard();
    expect(formatList(board)).not.toContain('comment');
    expect(formatList(boardAfter(board, 'comment', id, 'first'))).toContain('(1 comment)');
    const twice = boardAfter(boardAfter(board, 'comment', id, 'first'), 'comment', id, 'second');
    expect(formatList(twice)).toContain('(2 comments)');
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
    // `-h` is the other spelling this program takes for help at the top level, so it is the one
    // someone tries on a subcommand next.
    expect(run(emptyBoard(), 'add', '-h'))
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

  // The clock is held still and then moved on, or both stamps land in the same millisecond and the
  // last assertion passes for a card `set` never aged.
  it('moves updatedAt and leaves createdAt alone', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-04T10:00:00.000Z'));
      const { board, id } = withCard();
      const before = cardById(board, id);
      vi.setSystemTime(new Date('2026-03-04T10:00:00.000Z'));
      const next = boardAfter(board, 'set', id, '--priority', 'low');
      const after = cardById(next, id);
      expect(after?.createdAt).toBe(before?.createdAt);
      expect(after?.updatedAt).not.toBe(before?.updatedAt);
    } finally {
      vi.useRealTimers();
    }
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

describe('comment', () => {
  it('appends to the card and says how many there are', () => {
    const { board, id } = withCard();
    const result = run(board, 'comment', id, 'The race is in the debounce.');
    if (!result.ok || result.board === null) throw new Error(result.ok ? 'wrote nothing' : result.message);
    expect(cardById(result.board, id)?.comments?.map((comment) => comment.body))
      .toEqual(['The race is in the debounce.']);
    expect(result.output).toContain('1 comment');
  });

  // The reason the command exists: `set --notes` is the only other way to write on a card, and it
  // replaces. Two agents using it lose each other's findings.
  it('leaves the description and the earlier comments alone', () => {
    const { board, id } = withCard();
    const described = boardAfter(board, 'set', id, '--notes', 'What the card is about');
    const once = boardAfter(described, 'comment', id, 'first');
    const twice = boardAfter(once, 'comment', id, 'second');
    expect(cardById(twice, id)?.notes).toBe('What the card is about');
    expect(cardById(twice, id)?.comments?.map((comment) => comment.body)).toEqual(['first', 'second']);
  });

  it('refuses a blank one, a missing one and a card that is not there', () => {
    const { board, id } = withCard();
    expect(run(board, 'comment', id, '   ')).toMatchObject({ ok: false });
    expect(run(board, 'comment', id)).toMatchObject({ ok: false });
    expect(run(board, 'comment', 'nope', 'hello')).toMatchObject({ ok: false, message: 'no card with id nope' });
  });

  // `comment <id> found a bug` reads as three arguments and would quietly keep only "found". Refusing
  // is what tells the shell to quote it.
  it('refuses a body that arrived as several words', () => {
    const { board, id } = withCard();
    expect(run(board, 'comment', id, 'found', 'a', 'bug')).toMatchObject({ ok: false });
  });
});

describe('show', () => {
  it('prints the card with its description and its trail, oldest first', () => {
    const { board, id } = withCard('Ship it');
    const described = boardAfter(board, 'set', id, '--notes', 'What the card is about');
    const once = boardAfter(described, 'comment', id, 'first');
    const twice = boardAfter(once, 'comment', id, 'second');
    const result = run(twice, 'show', id);
    if (!result.ok) throw new Error(result.message);
    expect(result.output).toContain('Ship it');
    expect(result.output).toContain('What the card is about');
    expect(result.output.indexOf('first')).toBeLessThan(result.output.indexOf('second'));
    // Reading a card is not a change to it.
    expect(result.board).toBe(null);
  });

  // A card nobody has described yet: no blank line and no empty paragraph where the description would be.
  it('leaves out the description when there is none', () => {
    const { board, id } = withCard('Ship it');
    const result = run(boardAfter(board, 'comment', id, 'only a comment'), 'show', id);
    if (!result.ok) throw new Error(result.message);
    // Header, one blank, then the trail. A description would have sat on the third line.
    expect(result.output.split('\n')[2]).toMatch(/^--- #1 /);
    expect(result.output).toContain('only a comment');
  });

  // `at` is optional because a line written into board.json by hand has no time on it. Printing
  // `undefined` beside it would read as a date the file does not have.
  it('says so when a hand-written comment has no date', () => {
    const { board, id } = withCard();
    const written = boardAfter(board, 'comment', id, 'from a person');
    const card = cardById(written, id);
    if (!card?.comments) throw new Error('no trail');
    card.comments[0] = { body: 'from a person' };
    const result = run(written, 'show', id);
    if (!result.ok) throw new Error(result.message);
    expect(result.output).toContain('--- #1 · no date');
  });

  // The body is indented so only a separator ever starts at the left margin. A comment recording a
  // diff hunk carries `--- a/src/board.ts`, and unindented it reads back as a second entry.
  it('keeps a body that looks like a separator inside its own entry', () => {
    const { board, id } = withCard();
    const written = boardAfter(board, 'comment', id, '--- a/src/board.ts\n+++ b/src/board.ts');
    const result = run(written, 'show', id);
    if (!result.ok) throw new Error(result.message);
    expect(result.output.split('\n').filter((line) => line.startsWith('--- '))).toHaveLength(1);
    expect(result.output).toContain('  --- a/src/board.ts');
  });

  it('refuses a card that is not there', () => {
    expect(run(emptyBoard(), 'show', 'nope')).toMatchObject({ ok: false, message: 'no card with id nope' });
  });
});

// The window the second read closes: the app saved a comment onto this card after the command opened
// the board. Run once on the stale board and that comment is written back out of existence.
describe('runBoardCommandOnLatest', () => {
  it('works from the board as it stands, not the one it was handed', () => {
    const { board, id } = withCard();
    const saved = boardAfter(board, 'comment', id, 'typed in the app');
    const result = runBoardCommandOnLatest(board, ['comment', id, 'from the command line'], () => saved);
    if (!result.ok || result.board === null) throw new Error('comment failed');
    expect(cardById(result.board, id)?.comments?.map((comment) => comment.body)).toEqual([
      'typed in the app',
      'from the command line',
    ]);
  });

  // Nothing to write means nothing to lose, so the re-read is skipped and `list` stays one read.
  it('reads once when the command writes nothing', () => {
    const { board } = withCard();
    const readAgain = vi.fn(() => board);
    expect(runBoardCommandOnLatest(board, ['list'], readAgain).ok).toBe(true);
    expect(readAgain).not.toHaveBeenCalled();
  });

  // A refusal is the first run's, so the reason names the board the caller actually opened.
  it('does not read again after a refusal', () => {
    const readAgain = vi.fn(() => emptyBoard());
    expect(runBoardCommandOnLatest(emptyBoard(), ['move', 'nope', 'Done'], readAgain)).toMatchObject({
      ok: false,
      message: 'no card with id nope',
    });
    expect(readAgain).not.toHaveBeenCalled();
  });
});

describe('failureLine', () => {
  // A board that cannot be read is the terminal's problem, not a programming mistake: one sentence.
  it('answers an fs failure with its sentence', () => {
    const failure = Object.assign(new Error("EACCES: permission denied, open '.dashboard/board.json'"), { code: 'EACCES' });
    expect(failureLine(failure)).toBe("EACCES: permission denied, open '.dashboard/board.json'");
  });

  // A bug in here is answered with the file and the line, or an agent has nothing to open.
  it('keeps the stack of anything without an errno', () => {
    const bug = new Error("Cannot read properties of undefined (reading 'title')");
    expect(failureLine(bug)).toBe(bug.stack);
  });

  // Nothing thrown is required to be an Error, and a line is still owed.
  it('falls back to what a non-Error prints as', () => {
    expect(failureLine('board.json is gone')).toBe('board.json is gone');
  });
});
