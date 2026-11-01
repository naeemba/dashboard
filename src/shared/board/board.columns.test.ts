import { describe, expect, it } from 'vitest';
import {
  BACKLOG_COLUMN,
  REVIEW_COLUMN,
  SHIP_COLUMN,
  deleteCard,
  dropCard,
  emptyBoard,
  isWaitingColumn,
  landsInShip,
  moveCard,
  moveCardById,
  moveCardToColumn,
  renameCard,
  returnFromShip,
  reviewColumnIndex,
  selectionOf,
  shipColumnIndex,
  shipHome,
  startsShip,
  withBacklogColumn,
  withReviewColumn,
  withShipColumn,
  withoutEmptyShipColumn,
  type Board,
  type Card,
  type ShipHome,
} from './board';
import { MANAGER_PROJECT } from '../manager/manager';
import { board, titles } from './test-board';

describe('the Ship column', () => {
  it('sits just right of Todo on a new board', () => {
    expect(emptyBoard().columns.map((column) => column.name))
      .toEqual([BACKLOG_COLUMN, 'Todo', SHIP_COLUMN, 'Doing', REVIEW_COLUMN, 'Done']);
  });

  it('finds Ship whatever case it is written in', () => {
    expect(shipColumnIndex(emptyBoard())).toBe(2);
    expect(shipColumnIndex({ columns: [{ name: 'ship', cards: [] }] })).toBe(0);
    expect(shipColumnIndex({ columns: [{ name: 'Todo', cards: [] }] })).toBe(-1);
  });

  it('inserts an empty Ship second into a board that has none', () => {
    const old = { columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }] };
    expect(withShipColumn(old).columns.map((column) => column.name)).toEqual(['Todo', SHIP_COLUMN, 'Doing']);
    expect(withShipColumn(old).columns[1].cards).toEqual([]);
  });

  // The same object back, so a board that already has one neither burns an undo step nor is rewritten.
  it('hands back the same board when Ship is already there', () => {
    const board = emptyBoard();
    expect(withShipColumn(board)).toBe(board);
  });
});

describe('withoutEmptyShipColumn', () => {
  it('takes an empty Ship out, leaving the other columns in their order', () => {
    expect(withoutEmptyShipColumn(emptyBoard()).columns.map((column) => column.name))
      .toEqual([BACKLOG_COLUMN, 'Todo', 'Doing', REVIEW_COLUMN, 'Done']);
  });

  // Taking the column would take the cards in it, and those are somebody's cards.
  it('keeps a Ship column that has cards in it', () => {
    const handWritten = { columns: [{ name: 'Todo', cards: [] }, board(['written by hand']).columns[0]] };
    handWritten.columns[1].name = SHIP_COLUMN;
    expect(withoutEmptyShipColumn(handWritten)).toBe(handWritten);
  });

  it('hands back the same board when there is no Ship to take', () => {
    const board = { columns: [{ name: 'Todo', cards: [] }] };
    expect(withoutEmptyShipColumn(board)).toBe(board);
  });
});

describe('the Review column', () => {
  it('is fifth from the left on a new board', () => {
    expect(reviewColumnIndex(emptyBoard())).toBe(4);
  });

  it('finds Review whatever case it is written in', () => {
    expect(reviewColumnIndex({ columns: [{ name: 'review', cards: [] }] })).toBe(0);
    expect(reviewColumnIndex({ columns: [{ name: 'Todo', cards: [] }] })).toBe(-1);
  });

  // Placed by the column it comes before rather than by a number: a card reaches Review last before
  // it is finished, so it goes in front of Done wherever Done happens to be.
  it('inserts an empty Review in front of Done', () => {
    const old = { columns: [{ name: 'Todo', cards: [] }, { name: 'Done', cards: [] }] };
    expect(withReviewColumn(old).columns.map((column) => column.name))
      .toEqual(['Todo', REVIEW_COLUMN, 'Done']);
    expect(withReviewColumn(old).columns[1].cards).toEqual([]);
  });

  it('puts Review on the end of a board that never named a Done', () => {
    const old = { columns: [{ name: 'Todo', cards: [] }, { name: 'Shipped', cards: [] }] };
    expect(withReviewColumn(old).columns.map((column) => column.name))
      .toEqual(['Todo', 'Shipped', REVIEW_COLUMN]);
  });

  // The same object back, so a board that already has one neither burns an undo step nor is rewritten.
  it('hands back the same board when Review is already there', () => {
    const board = emptyBoard();
    expect(withReviewColumn(board)).toBe(board);
  });
});

describe('moveCardById', () => {
  const board = {
    columns: [
      { name: 'Todo', cards: [{ id: 'a', title: 'a', notes: '', priority: 'medium' as const, parent: null }] },
      { name: REVIEW_COLUMN, cards: [] },
    ],
  };

  it('moves the card the id names', () => {
    expect(moveCardById(board, 'a', 1)?.columns.map((column) => column.cards.map((card) => card.id)))
      .toEqual([[], ['a']]);
  });

  // Null rather than the board unchanged, because every caller writes the answer to disk: an identical
  // rewrite is a file whose mtime moved for nothing, which is a board redrawn under somebody's cursor.
  it('is null when there is nothing to do', () => {
    expect(moveCardById(board, 'a', 0)).toBeNull();
    expect(moveCardById(board, 'nobody', 1)).toBeNull();
    expect(moveCardById(board, 'a', -1)).toBeNull();
    expect(moveCardById(board, 'a', 9)).toBeNull();
  });
});

describe('moveCardToColumn', () => {
  const board = {
    columns: [
      { name: 'Todo', cards: [{ id: 'a', title: 'a', notes: '', priority: 'medium' as const, parent: null }] },
      { name: SHIP_COLUMN, cards: [] },
      { name: 'Doing', cards: [] },
    ],
  };

  it('moves a card straight to a column two along, and lands it last', () => {
    const moved = moveCardToColumn(board, { column: 0, card: 0 }, 2);
    expect(moved.board.columns[0].cards).toEqual([]);
    expect(moved.board.columns[2].cards.map((card) => card.id)).toEqual(['a']);
    expect(moved.selection).toEqual({ column: 2, card: 0 });
  });

  it('ages the card, because a column change is a change to the work', () => {
    const moved = moveCardToColumn(board, { column: 0, card: 0 }, 1);
    expect(moved.board.columns[1].cards[0].updatedAt).toEqual(expect.any(String));
  });

  it('hands back the same board when there is nothing to do', () => {
    expect(moveCardToColumn(board, { column: 0, card: 0 }, 0).board).toBe(board);
    expect(moveCardToColumn(board, { column: 0, card: 0 }, 9).board).toBe(board);
    expect(moveCardToColumn(board, { column: 1, card: 0 }, 2).board).toBe(board);
  });
});

// A ship that worked, on main's board. The file there is what the next `git pull` merges into, so the
// round trip into Ship and back has to leave it exactly as it was — or every ship leaves board.json
// dirty and the pull after it conflicts.
describe('returnFromShip', () => {
  const card = (id: string) => ({ id, title: id, notes: '', priority: 'medium' as const, parent: null });
  const before: Board = {
    columns: [
      { name: 'Todo', cards: [card('a'), card('b'), card('c')] },
      { name: SHIP_COLUMN, cards: [] },
    ],
  };
  const shipped = moveCardToColumn(before, { column: 0, card: 1 }, 1).board;
  const landed = shipped.columns[1].cards[0];
  const home = shipHome(before, { column: 0, card: 1 });

  it('puts the card back in its row, as it was, so the file comes out byte for byte the same', () => {
    const back = returnFromShip(shipped, card('b'), landed, home);
    expect(JSON.stringify(back?.board)).toBe(JSON.stringify(before));
    expect(back?.selection).toEqual({ column: 0, card: 1 });
  });

  it('keeps an edit made while the ship ran, and still takes the card home', () => {
    const renamed = renameCard(shipped, { column: 1, card: 0 }, 'renamed').board;
    const back = returnFromShip(renamed, card('b'), landed, home);
    expect(back?.board.columns[0].cards[1].title).toBe('renamed');
    expect(back?.board.columns[1].cards).toEqual([]);
  });

  it('lands last when the column has shrunk under the row it came from', () => {
    const shrunk = deleteCard(deleteCard(shipped, { column: 0, card: 1 }).board, { column: 0, card: 0 }).board;
    const back = returnFromShip(shrunk, card('b'), landed, home);
    expect(back?.board.columns[0].cards.map((entry) => entry.id)).toEqual(['b']);
  });

  it('leaves a card you already moved home yourself where you put it', () => {
    const moved = moveCardToColumn(shipped, { column: 1, card: 0 }, 0).board;
    expect(returnFromShip(moved, card('b'), landed, home)).toBeNull();
  });

  it('answers null for a card that is no longer on the board', () => {
    const gone = deleteCard(shipped, { column: 1, card: 0 }).board;
    expect(returnFromShip(gone, card('b'), landed, home)).toBeNull();
  });

  // Ship one card, then another from the same column while the first is still out, and let them come
  // back in either order. Rows alone put [a, b, c] back as [b, a, c]; the cards below alone as
  // [a, c, b]. Every pair and every finish order has to leave the file as it was.
  const ids = ['a', 'b', 'c', 'd'];
  const column: Board = {
    columns: [
      { name: 'Todo', cards: ids.map(card) },
      { name: SHIP_COLUMN, cards: [] },
    ],
  };
  type Away = { id: string; landed: Card; home: ShipHome };

  function shipAll(order: string[]): { board: Board; away: Away[] } {
    let board = column;
    const away: Away[] = [];
    for (const id of order) {
      const from = selectionOf(board, id)!;
      const home = shipHome(board, from, away.map((entry) => entry.home));
      board = moveCardToColumn(board, from, 1).board;
      away.push({ id, landed: board.columns[1].cards.at(-1)!, home });
    }
    return { board, away };
  }

  function permutations(items: string[]): string[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, index) =>
      permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
  }

  const pairs = ids.flatMap((first) => ids.filter((second) => second !== first).map((second) => [first, second]));
  const triples = permutations(ids).map((order) => order.slice(0, 3));

  it.each([...pairs, ...triples].map((shipped) => ({ label: shipped.join(' then '), shipped })))(
    'puts ships $label from one column back as they were, whichever finishes first',
    ({ shipped }) => {
      const { board, away } = shipAll(shipped);
      for (const finish of permutations(away.map((entry) => entry.id))) {
        let back = board;
        for (const id of finish) {
          const entry = away.find((candidate) => candidate.id === id)!;
          back = returnFromShip(back, card(id), entry.landed, entry.home)!.board;
        }
        expect(JSON.stringify(back), `finished ${finish.join(', ')}`).toBe(JSON.stringify(column));
      }
    },
  );
});

// The condition that decides whether a keystroke starts an agent. It was composed inline in the view,
// where nothing pinned it: drop the direction and a card dragged leftward out of Doing makes a
// worktree and takes a pane on its way past.
describe('landsInShip', () => {
  const board = {
    columns: [
      { name: 'Todo', cards: [] },
      { name: SHIP_COLUMN, cards: [] },
      { name: 'Doing', cards: [] },
    ],
  };

  it('says yes to a card moved rightward into Ship', () => {
    expect(landsInShip(board, 0, { column: 1, card: 0 }, 'right')).toBe(true);
  });

  it('says no to a card moved rightward out of Ship into Doing', () => {
    expect(landsInShip(board, 1, { column: 2, card: 0 }, 'right')).toBe(false);
  });

  // The one that costs something: leftward into Ship would start an agent from a keystroke that reads
  // as putting a card back.
  it('says no to a card moved leftward into Ship from Doing', () => {
    expect(landsInShip(board, 2, { column: 1, card: 0 }, 'left')).toBe(false);
  });

  // The pointer is allowed in from either side. A drag aimed at Ship said where it was going; a
  // leftward keystroke, the one the direction guard exists for, never did.
  it('says yes to a card let go of on Ship from the column to its right', () => {
    expect(landsInShip(board, 2, { column: 1, card: 0 }, 'drop')).toBe(true);
  });

  it('says no to a card let go of on the column it was already in', () => {
    expect(landsInShip(board, 1, { column: 1, card: 0 }, 'drop')).toBe(false);
  });

  it('says no to a card reordered inside Ship', () => {
    expect(landsInShip(board, 1, { column: 1, card: 1 }, 'down')).toBe(false);
    expect(landsInShip(board, 1, { column: 1, card: 0 }, 'up')).toBe(false);
  });

  // moveCard hands back the selection it was given when there is nowhere to go, so `from` and the
  // column landed in are the same. A board written by hand with Ship last would otherwise re-ship a
  // card every time you pushed it against the right-hand edge.
  it('says no to a move that changed nothing', () => {
    const shipLast = { columns: [{ name: 'Todo', cards: [] }, { name: SHIP_COLUMN, cards: [] }] };
    expect(landsInShip(shipLast, 1, { column: 1, card: 0 }, 'right')).toBe(false);
  });

  it('says no on an empty column, and on a board with no Ship column at all', () => {
    expect(landsInShip(board, 0, { column: 0, card: 0 }, 'right')).toBe(false);
    const noShip = { columns: [{ name: 'Todo', cards: [] }, { name: 'Doing', cards: [] }] };
    expect(landsInShip(noShip, 0, { column: 1, card: 0 }, 'right')).toBe(false);
  });
});

// The one thing between a card on the manager's board and a worktree made with no project to make it
// in. The manager's board has a Ship column only when somebody wrote one into its file by hand.
describe('startsShip', () => {
  const board = { columns: [{ name: 'Todo', cards: [] }, { name: SHIP_COLUMN, cards: [] }] };

  it('starts one for a project whose card lands in Ship', () => {
    expect(startsShip('/work/api', board, 0, { column: 1, card: 0 }, 'right')).toBe(true);
    expect(startsShip('/work/api', board, 0, { column: 1, card: 0 }, 'drop')).toBe(true);
  });

  it('never starts one on the manager\'s board, even into a Ship column written by hand', () => {
    expect(startsShip(MANAGER_PROJECT.path, board, 0, { column: 1, card: 0 }, 'right')).toBe(false);
    expect(startsShip(MANAGER_PROJECT.path, board, 0, { column: 1, card: 0 }, 'drop')).toBe(false);
  });

  it('starts none for a project whose card does not land in Ship', () => {
    expect(startsShip('/work/api', board, 1, { column: 0, card: 0 }, 'left')).toBe(false);
  });
});

describe('dropCard', () => {
  const three = board(['a', 'b', 'c'], []);

  it('lands a card on the row the pointer named in another column', () => {
    const filled = board(['a'], ['x', 'y']);
    expect(titles(dropCard(filled, { column: 0, card: 0 }, 1, 1).board)).toEqual([[], ['x', 'a', 'y']]);
  });

  it('lands a card last in another column when the row is the end of it', () => {
    const filled = board(['a'], ['x', 'y']);
    const dropped = dropCard(filled, { column: 0, card: 0 }, 1, 2);
    expect(titles(dropped.board)).toEqual([[], ['x', 'y', 'a']]);
    expect(dropped.selection).toEqual({ column: 1, card: 2 });
  });

  it('ages a card that crossed a column and leaves one that only changed rows alone', () => {
    const crossed = dropCard(board(['a'], []), { column: 0, card: 0 }, 1, 0);
    expect(crossed.board.columns[1].cards[0].updatedAt).toEqual(expect.any(String));
    const reordered = dropCard(three, { column: 0, card: 0 }, 0, 3);
    expect(reordered.board.columns[0].cards[2].updatedAt).toBeUndefined();
  });

  // The row is read in the column as it looks before the card is lifted out, so a card going down its
  // own column lands one row above the number: taking it out pulls everything below it up.
  it('reorders inside a column, counting the row before the card has left it', () => {
    expect(titles(dropCard(three, { column: 0, card: 0 }, 0, 2).board)).toEqual([['b', 'a', 'c'], []]);
    expect(titles(dropCard(three, { column: 0, card: 0 }, 0, 3).board)).toEqual([['b', 'c', 'a'], []]);
    expect(titles(dropCard(three, { column: 0, card: 2 }, 0, 0).board)).toEqual([['c', 'a', 'b'], []]);
  });

  it('carries the selection to wherever the card landed', () => {
    expect(dropCard(three, { column: 0, card: 0 }, 0, 3).selection).toEqual({ column: 0, card: 2 });
  });

  // Same board back, so the undo step and the file on disk are both left alone.
  it('hands back the same board when the card was let go of where it already was', () => {
    expect(dropCard(three, { column: 0, card: 1 }, 0, 1).board).toBe(three);
    expect(dropCard(three, { column: 0, card: 1 }, 0, 2).board).toBe(three);
  });

  it('hands back the same board for a column that is not there and a column with no card in it', () => {
    expect(dropCard(three, { column: 0, card: 0 }, 9, 0).board).toBe(three);
    expect(dropCard(three, { column: 1, card: 0 }, 0, 0).board).toBe(three);
  });

  // The view measures the rows it draws, so it cannot name one that is not there — but dropCard is
  // reached from outside the view too, and a row past the end has to mean the end.
  it('clamps a row past the end of the column it lands in', () => {
    expect(titles(dropCard(board(['a'], ['x']), { column: 0, card: 0 }, 1, 9).board)).toEqual([[], ['x', 'a']]);
  });
});

describe('moveCard', () => {
  it('swaps with the card above or below', () => {
    const result = moveCard(board(['a', 'b', 'c']), { column: 0, card: 2 }, 'up');
    expect(titles(result.board)).toEqual([['a', 'c', 'b']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('stays put at the top and the bottom, and hands back the same board', () => {
    const start = board(['a', 'b']);
    const up = moveCard(start, { column: 0, card: 0 }, 'up');
    expect(up).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(up.board).toBe(start);
    const down = moveCard(start, { column: 0, card: 1 }, 'down');
    expect(down).toEqual({ board: start, selection: { column: 0, card: 1 } });
    expect(down.board).toBe(start);
  });

  // A card sent sideways keeps its row rather than dropping to the bottom of the next column.
  it('sends a card to the next column at the same row', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x', 'y', 'z']), { column: 0, card: 1 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'c'], ['x', 'b', 'y', 'z']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('lands at the end when the next column is shorter', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x']), { column: 0, card: 2 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'b'], ['x', 'c']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('stays put at the outer columns, and hands back the same board', () => {
    const start = board(['a'], ['b']);
    const left = moveCard(start, { column: 0, card: 0 }, 'left');
    expect(left).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(left.board).toBe(start);
    const right = moveCard(start, { column: 1, card: 0 }, 'right');
    expect(right).toEqual({ board: start, selection: { column: 1, card: 0 } });
    expect(right.board).toBe(start);
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([], ['a']);
    const result = moveCard(start, { column: 0, card: 0 }, 'right');
    expect(result).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(result.board).toBe(start);
  });
});

describe('withBacklogColumn', () => {
  it('puts Backlog first on a board without one', () => {
    const board = { columns: [{ name: 'Todo', cards: [] }, { name: 'Done', cards: [] }] };
    expect(withBacklogColumn(board).columns.map((column) => column.name)).toEqual(['Backlog', 'Todo', 'Done']);
  });

  it('hands back the same board when Backlog is already there, wherever it sits', () => {
    const board = { columns: [{ name: 'Todo', cards: [] }, { name: 'backlog', cards: [] }] };
    expect(withBacklogColumn(board)).toBe(board);
  });

  it('is part of a new board', () => {
    expect(emptyBoard().columns.map((column) => column.name))
      .toEqual([BACKLOG_COLUMN, 'Todo', 'Ship', 'Doing', 'Review', 'Done']);
  });
});

describe('isWaitingColumn', () => {
  it('counts Backlog and Todo as waiting, and nothing after', () => {
    const board = emptyBoard();
    expect([0, 1, 2, 3].map((index) => isWaitingColumn(board, index))).toEqual([true, true, false, false]);
  });

  it('counts the first column as waiting on a board with no Todo', () => {
    const board = { columns: [{ name: 'Ideas', cards: [] }, { name: 'Done', cards: [] }] };
    expect(isWaitingColumn(board, 0)).toBe(true);
    expect(isWaitingColumn(board, 1)).toBe(false);
  });

  it('finds Backlog by name wherever it sits', () => {
    const board = { columns: ['Todo', 'Doing', 'Backlog', 'Done'].map((name) => ({ name, cards: [] })) };
    expect([0, 1, 2, 3].map((index) => isWaitingColumn(board, index))).toEqual([true, false, true, false]);
  });
});
