import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, type Board } from '../../../shared/board/board';
import type { MoveSource } from '../../../shared/board/column-entry';
import { cardMove, type CardMovePorts } from './move';

const PROJECT = '/work/api';

function boardWithCard(): Board {
  return addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'Fix login').board;
}

type Seen = { writes: { board: Board; source: MoveSource }[]; ran: string[] };

function fakePorts(over: Partial<CardMovePorts> = {}): { ports: CardMovePorts; seen: Seen } {
  const seen: Seen = { writes: [], ran: [] };
  let board = boardWithCard();
  return {
    seen,
    ports: {
      read: () => ({ board, brokenFiles: [] }),
      write: (_projectPath, next, source) => { board = next; seen.writes.push({ board: next, source }); },
      projectBoard: () => true,
      autoLoop: () => true,
      ship: async () => { seen.ran.push('ship'); return { output: 'shipped on fix-login' }; },
      review: async () => { seen.ran.push('review'); return { output: 'review started' }; },
      ...over,
    },
  };
}

function columnOf(board: Board): string | undefined {
  return board.columns.find((column) => column.cards.some((card) => card.id === 'card'))?.name;
}

async function move(ports: CardMovePorts, column: string, source: MoveSource = 'command') {
  const input = cardMove.input({ projectPath: PROJECT, id: 'card', column, source });
  if ('refused' in input) throw new Error(input.refused);
  return cardMove.run(ports, input);
}

describe('card.move', () => {
  it('writes the move, then ships a card entering Ship', async () => {
    const { ports, seen } = fakePorts();
    await expect(move(ports, 'Ship')).resolves.toEqual({ output: 'Fix login  →  Ship\nshipped on fix-login', ran: 'ship' });
    expect(seen.writes.map(({ board, source }) => [columnOf(board), source])).toEqual([['Ship', 'command']]);
    expect(seen.ran).toEqual(['ship']);
  });

  it('starts the review loop for a card a person moves into Review', async () => {
    const { ports, seen } = fakePorts({ autoLoop: () => false });
    await expect(move(ports, 'review', 'user')).resolves.toMatchObject({ ran: 'review' });
    expect(seen.ran).toEqual(['review']);
  });

  it('leaves a card the sweep moves into Review waiting when the loop is off', async () => {
    const { ports, seen } = fakePorts({ autoLoop: () => false });
    await expect(move(ports, 'Review', 'automatic')).resolves.toEqual({ output: 'Fix login  →  Review', ran: 'nothing' });
    expect(seen.ran).toEqual([]);
    expect(seen.writes.map(({ source }) => source)).toEqual(['automatic']);
  });

  it('starts nothing on a board that is not a project\'s own', async () => {
    const { ports, seen } = fakePorts({ projectBoard: () => false });
    await expect(move(ports, 'Ship')).resolves.toMatchObject({ ran: 'nothing' });
    expect(seen.ran).toEqual([]);
  });

  it('writes nothing for a card already there and still runs the entry', async () => {
    const { ports, seen } = fakePorts();
    await move(ports, 'Ship');
    await expect(move(ports, 'Ship', 'user')).resolves.toEqual({ output: 'Fix login is already in Ship\nshipped on fix-login', ran: 'ship' });
    expect(seen.writes).toHaveLength(1);
    expect(seen.ran).toEqual(['ship', 'ship']);
  });

  it('keeps the move and answers the refusal when the ship is refused', async () => {
    const { ports, seen } = fakePorts({ ship: async () => ({ refused: '"Fix login" is already shipped on fix-login' }) });
    await expect(move(ports, 'Ship')).resolves.toEqual({ refused: 'Fix login  →  Ship; "Fix login" is already shipped on fix-login' });
    expect(columnOf(seen.writes[0].board)).toBe('Ship');
  });

  it('refuses an unknown card, an unknown column and a board that does not parse, writing nothing', async () => {
    const { ports, seen } = fakePorts();
    await expect(move(ports, 'Nowhere')).resolves.toMatchObject({ refused: expect.stringContaining('Nowhere') });
    const unknown = cardMove.input({ projectPath: PROJECT, id: 'gone', column: 'Done', source: 'user' });
    if ('refused' in unknown) throw new Error(unknown.refused);
    await expect(cardMove.run(ports, unknown)).resolves.toEqual({ refused: 'no card with id gone' });
    const broken = fakePorts({ read: () => ({ board: boardWithCard(), brokenFiles: ['/work/api/.dashboard/board/cards/x.json'] }) });
    await expect(move(broken.ports, 'Done')).resolves.toMatchObject({ refused: expect.stringContaining('x.json') });
    expect([...seen.writes, ...broken.seen.writes]).toEqual([]);
  });

  it('checks its input once, at the edge', () => {
    expect(cardMove.input({ projectPath: PROJECT, id: 'card', source: 'user' })).toEqual({ refused: 'move needs a card id and a column' });
    expect(cardMove.input({ projectPath: PROJECT, id: '', column: 'Done', source: 'user' })).toEqual({ refused: 'no card id was given' });
    expect(cardMove.input({ projectPath: PROJECT, id: 'card', column: 'Done', source: 'robot' })).toEqual({ refused: 'a move needs a source' });
  });
});
