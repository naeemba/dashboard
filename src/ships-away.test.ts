import { describe, expect, it } from 'vitest';
import { returnFromShip, selectionOf, shipHome, SHIP_COLUMN, type Board, type Card } from './board';
import { bringHome, createShipsAway, type ShipsAway } from './ships-away';

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

function ids(board: Board): string[][] {
  return board.columns.map((entry) => entry.cards.map((each) => each.id));
}

describe('shipsAway', () => {
  // Two views of one project, each holding its own copy of the board, and one file between them. Each
  // view listens the way board-view.ts does, reading the file again when the other one puts a ship home.
  it('brings ships home on the file, not on a stale view, when two views of one project ship', async () => {
    const homes = createShipsAway();
    let disk = column;
    const stack = { board: column };
    const page = { board: column };
    for (const view of [stack, page]) homes.listen('/web', view, () => { view.board = disk; });
    const writeFrom = (view: { board: Board }, next: Board) => { view.board = next; disk = next; };
    const home = (view: { board: Board }, out: ReturnType<typeof shipOut>) => bringHome({
      read: async () => { view.board = disk; return true; },
      putHome: async () => {
        const moved = returnFromShip(view.board, card(out.landed.id), out.landed, out.home);
        out.forget();
        if (!moved) return false;
        writeFrom(view, moved.board);
        return true;
      },
      announce: () => homes.cameHome('/web', view),
    });
    // 1. `b` from the manager's stack.
    const fromStack = shipOut(stack.board, 'b', homes, '/web');
    writeFrom(stack, fromStack.board);
    // 2. The project's own board reads the file on the way in, and ships `c`.
    page.board = disk;
    const fromPage = shipOut(page.board, 'c', homes, '/web');
    writeFrom(page, fromPage.board);
    // 3. `b` finishes first, in the stack, which still holds the board from step 1. Put home on that
    // copy, `c` would drop out of Ship while its ship is still running.
    await home(stack, fromStack);
    expect(ids(disk)).toEqual([['a', 'b'], ['c']]);
    // The page heard and read the file, so its next keystroke cannot write `b` back into Ship.
    expect(page.board).toBe(disk);
    // 4. `c` finishes on the page.
    await home(page, fromPage);
    expect(ids(disk)).toEqual([['a', 'b', 'c'], []]);
  });

  it('leaves the card in Ship, writes nothing and tells nobody when the read fails', async () => {
    const steps: string[] = [];
    await bringHome({
      read: async () => { steps.push('read'); return false; },
      putHome: async () => { steps.push('put home'); return true; },
      announce: () => steps.push('announce'),
    });
    expect(steps).toEqual(['read']);
  });

  it('tells nobody when there was nothing to put home', async () => {
    const steps: string[] = [];
    await bringHome({
      read: async () => true,
      putHome: async () => { steps.push('put home'); return false; },
      announce: () => steps.push('announce'),
    });
    expect(steps).toEqual(['put home']);
  });

  it('tells only the other views of the same project, and stops once a view is dropped', () => {
    const homes = createShipsAway();
    const heard: string[] = [];
    const writer = {};
    homes.listen('/web', writer, () => heard.push('writer'));
    const stop = homes.listen('/web', {}, () => heard.push('other view'));
    homes.listen('/api', {}, () => heard.push('other project'));
    homes.cameHome('/web', writer);
    expect(heard).toEqual(['other view']);
    stop();
    homes.cameHome('/web', writer);
    expect(heard).toEqual(['other view']);
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
