import { describe, expect, it } from 'vitest';
import { emptyBoard, type Board } from '../../../shared/board/board';
import { channels } from '../../app/channels';
import { writeBoard } from '../../board/board-store';
import { temporaryFolder } from '../../testing/temporary-folder';
import { bind } from '../action';
import { cardActions, type CardActionsMain } from './card-actions';
import { cardShip, type CardShipPorts } from './ship';

function boardWithCard(): Board {
  const board = emptyBoard();
  board.columns[0].cards.push({ id: 'card', title: 'Fix login', notes: '', priority: 'medium', parent: null });
  return board;
}

function ship(over: Partial<CardShipPorts> = {}) {
  const asked: unknown[] = [];
  const bound = bind(cardShip, {
    read: boardWithCard,
    slotOf: () => 2,
    ship: async (input) => { asked.push(input); return { output: 'queued q1, 1st' }; },
    ...over,
  });
  return { call: bound.call, asked };
}

describe('card.ship', () => {
  it('hands the card to the pane pool with its title and its place in the queue', async () => {
    const { call, asked } = ship();
    await expect(call({ projectPath: '/work/api', id: 'card', first: true, after: 'other', source: 'command' })).resolves.toEqual({ output: 'queued q1, 1st' });
    expect(asked).toEqual([{ projectPath: '/work/api', id: 'card', first: true, after: 'other', title: 'Fix login' }]);
  });

  it('takes a move\'s ship as last in line, holding for nobody', async () => {
    const { call, asked } = ship();
    await call({ projectPath: '/work/api', id: 'card', source: 'user' });
    expect(asked).toMatchObject([{ first: false, after: null }]);
  });

  it('refuses an unknown card, a closed project and flags it cannot read', async () => {
    await expect(ship().call({ projectPath: '/work/api', id: 'gone' })).resolves.toEqual({ refused: 'no card with id gone' });
    await expect(ship({ slotOf: () => -1 }).call({ projectPath: '/work/api', id: 'card' })).resolves.toMatchObject({ refused: expect.stringContaining('Fix login') });
    await expect(ship().call({ projectPath: '/work/api', id: 'card', after: '' })).resolves.toEqual({ refused: 'ship takes --first, and --after with a card id' });
    await expect(ship().call({ projectPath: '/work/api', id: 'card', first: 'yes' })).resolves.toEqual({ refused: 'ship takes --first, and --after with a card id' });
  });
});

// The doors card-actions.ts builds on the pane pool, and the start the pool calls back.
describe('the card actions on the pane pool', () => {
  function cards(slot = 2) {
    const started: Record<string, unknown>[] = [];
    const projectPath = temporaryFolder('dashboard-card-ship-');
    writeBoard(projectPath, boardWithCard());
    const built = cardActions({
      table: channels(), worktrees: () => [], slotOf: () => slot, log: () => undefined,
      startWork: async (raw: Record<string, unknown>) => { started.push(raw); return { output: 'queued q1, 1st' }; },
    } as unknown as CardActionsMain);
    const verb = (name: string) => built.actions.find((each) => each.name === name)!;
    return { built, verb, started, projectPath };
  }

  it('starts a ship and a review through pane.start, reporting to the project\'s main', async () => {
    const { verb, started, projectPath } = cards();
    await verb('card.ship').call({ projectPath, id: 'card', source: 'command' });
    await verb('card.review').call({ projectPath, id: 'card', source: 'command' });
    expect(started).toEqual([
      { dispatcherPath: projectPath, projectPath, cardId: 'card', after: null, first: false, work: { kind: 'ship', title: 'Fix login' } },
      { dispatcherPath: projectPath, projectPath, cardId: 'card', after: null, first: false, work: { kind: 'review' } },
    ]);
  });

  it('refuses to begin a run, a ship whose project closed while queued, and a review with no worktree', async () => {
    const entry = { id: 'q1', dispatcherPath: '/work/api', projectPath: '/work/api', cardId: 'card', after: null, queuedAt: '' };
    const { built } = cards(-1);
    await expect(built.begin({ ...entry, work: { kind: 'run', project: null, prompt: 'p', card: null, worktree: false, folder: null, as: null } }))
      .resolves.toEqual({ refused: 'not a card\'s start' });
    await expect(built.begin({ ...entry, work: { kind: 'ship', title: 'Fix login' } })).resolves.toMatchObject({ refused: expect.stringContaining('Fix login') });
    await expect(built.begin({ ...entry, work: { kind: 'review' } })).resolves.toEqual({ refused: 'card card has no worktree to review; ship it first' });
  });
});
