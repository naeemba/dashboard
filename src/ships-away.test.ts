import { describe, expect, it } from 'vitest';
import { returnFromShip, selectionOf, shipHome, SHIP_COLUMN, type Board, type Card } from './board';
import { createShipsAway } from './ships-away';

function card(id: string): Card {
  return { id, title: id, notes: '', priority: 'medium', parent: null };
}

const column: Board = {
  columns: [
    { name: 'Todo', cards: [card('a'), card('b'), card('c')] },
    { name: SHIP_COLUMN, cards: [] },
  ],
};

function shipOut(board: Board, id: string, homes: ReturnType<typeof createShipsAway>, projectPath: string) {
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
  it('shares ships between two views of one project, so they come back in their own order', () => {
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
