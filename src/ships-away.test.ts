import { describe, expect, it } from 'vitest';
import { returnFromShip, selectionOf, shipHome, SHIP_COLUMN, type Board, type Card } from './board';
import { createShipsAway, type ShipsAway } from './ships-away';

function card(id: string): Card {
  return { id, title: id, notes: '', priority: 'medium', parent: null };
}

const column: Board = {
  columns: [
    { name: 'Todo', cards: [card('a'), card('b'), card('c')] },
    { name: SHIP_COLUMN, cards: [] },
  ],
};

function shipOut(board: Board, id: string, homes: ShipsAway, projectPath: string) {
  const from = selectionOf(board, id)!;
  const home = shipHome(board, from, homes.away(projectPath));
  const todo = board.columns[0].cards.filter((entry) => entry.id !== id);
  const landed = card(id);
  const next: Board = {
    columns: [{ ...board.columns[0], cards: todo }, { ...board.columns[1], cards: [...board.columns[1].cards, landed] }],
  };
  return { board: next, home, landed, forget: homes.leave(projectPath, home) };
}

describe('shipsAway', () => {
  // Two views of one project, each holding its own copy of the board, and one file between them.
  // Each ship comes home on what the file says when it finishes, not on the copy of the view it
  // finished in — the manager's stack is hidden by then and still thinks `c` is in Todo.
  it('brings ships home on the file, not on a stale view, when two views of one project ship', () => {
    const homes = createShipsAway();
    let disk = column;
    // 1. `b` from the manager's stack.
    const stack = shipOut(disk, 'b', homes, '/web');
    disk = stack.board;
    // 2. The project's own board reads the file on the way in, and ships `c`.
    const page = shipOut(disk, 'c', homes, '/web');
    disk = page.board;
    // 3. `b` finishes first, in the stack, which still holds the board from step 1.
    expect(stack.board).not.toEqual(disk);
    disk = returnFromShip(disk, card('b'), stack.landed, stack.home)!.board;
    stack.forget();
    // 4. `c` finishes on the page, whose copy never heard about step 3.
    disk = returnFromShip(disk, card('c'), page.landed, page.home)!.board;
    page.forget();
    expect(disk.columns.map((entry) => entry.cards.map((each) => each.id))).toEqual([['a', 'b', 'c'], []]);
  });

  it('tells every view which view put a ship home, and for which project', () => {
    const homes = createShipsAway();
    const heard: [string, unknown][] = [];
    homes.listen((projectPath, writer) => heard.push([projectPath, writer]));
    homes.listen((projectPath, writer) => heard.push([projectPath, writer]));
    const view = {};
    homes.cameHome('/web', view);
    expect(heard).toEqual([['/web', view], ['/web', view]]);
  });

  it('shares ships still out between views of one project, so they come back in their own order', () => {
    const homes = createShipsAway();
    // `b` from the manager's stack, then `c` from the page's own board: two views, one project.
    const first = shipOut(column, 'b', homes, '/web');
    const second = shipOut(first.board, 'c', homes, '/web');
    let back = returnFromShip(second.board, card('b'), first.landed, first.home)!.board;
    first.forget();
    back = returnFromShip(back, card('c'), second.landed, second.home)!.board;
    second.forget();
    expect(back.columns[0].cards.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps one project\'s ships out of another\'s', () => {
    const homes = createShipsAway();
    shipOut(column, 'b', homes, '/web');
    expect(homes.away('/api')).toEqual([]);
  });

  it('forgets a ship once it is back or has failed, and only that one', () => {
    const homes = createShipsAway();
    const first = shipOut(column, 'b', homes, '/web');
    const second = shipOut(first.board, 'c', homes, '/web');
    first.forget();
    expect(homes.away('/web')).toEqual([second.home]);
    second.forget();
    expect(homes.away('/web')).toEqual([]);
  });
});
