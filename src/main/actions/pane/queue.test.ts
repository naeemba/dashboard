import { describe, expect, it } from 'vitest';
import type { Refused } from '../../../shared/app/bridge';
import { addCard, emptyBoard, type Board } from '../../../shared/board/board';
import type { QueueEntry } from '../../workers/pane-pool';
import type { SavedQueue } from '../../workers/pane-queue-store';
import { panePool, type PaneQueuePorts } from './queue';

// A total cap of `total`, no cap per project.
const total = (cap: number) => () => ({ project: null, total: cap });

// One open project, api, with `running` workers holding slots under a total cap of 2. A start settles
// when the test says: `finish(id)` resolves the start of that queue id.
function pool(over: Partial<Omit<PaneQueuePorts, 'pool'>> = {}, saved: SavedQueue = { next: 1, entries: [] }) {
  const counts = { running: 0, unreadable: false };
  const told: string[] = [];
  const moves: string[] = [];
  const gone: string[] = [];
  const begun: string[] = [];
  const saves: SavedQueue[] = [];
  const pending = new Map<string, (result: { output: string } | Refused) => void>();
  const board: Board = { columns: emptyBoard().columns.map((column, at) => (at === 0 ? { ...column, cards: [{ id: 'a', title: 'A', notes: '', priority: 'medium' as const, parent: null }] } : column)) };
  const actions = panePool(saved, {
    save: (each) => { saves.push(structuredClone(each)); },
    running: () => new Map([['/work/api', counts.running]]),
    cap: total(2),
    worker: () => null,
    holds: () => false,
    alive: () => true,
    budget: () => null,
    open: () => true,
    board: () => board,
    drainBoard: () => (counts.unreadable ? null : board),
    begin: (entry: QueueEntry) => new Promise((resolve) => { begun.push(entry.id); pending.set(entry.id, resolve); }),
    tell: (dispatcherPath, text) => { told.push(`${dispatcherPath}: ${text}`); },
    now: () => Date.parse('2026-11-26T12:00:00.000Z'),
    // card.move refuses while any card file does not parse, as move.ts does.
    move: async (_projectPath, cardId, column) => {
      if (counts.unreadable) return { refused: 'board files do not parse, nothing was written' };
      moves.push(`${cardId} ${column}`);
      return { output: '' };
    },
    gone: (entry) => { gone.push(entry.id); },
    ...over,
  });
  const finish = async (id: string, result: { output: string } | Refused = { output: `started ${id}` }) => {
    pending.get(id)?.(result);
    // The settle's own then, and the drain it runs.
    await new Promise((resolve) => setImmediate(resolve));
  };
  const start = (over: Record<string, unknown> = {}) => actions.start.call({
    dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, first: false,
    work: { kind: 'run', project: null, prompt: 'fix it', card: null, worktree: false, folder: null, as: null }, ...over,
  });
  return { actions, counts, told, begun, saves, finish, start, board, moves, gone };
}

describe('pane.start', () => {
  // card.review by hand on a card still in Doing: its follow's move into Review asks for the review
  // again from inside the start holding its slot, which goes on in place rather than refusing itself.
  it('lets a review asked for again inside its own start go on in place', async () => {
    const begun: string[] = [];
    const made = pool({
      begin: (entry: QueueEntry) => {
        begun.push(entry.id);
        if (begun.length === 1) return made.start({ cardId: 'a', work: { kind: 'review' } });
        return Promise.resolve({ output: 'review started' });
      },
    });
    made.actions.ready();
    await expect(made.start({ cardId: 'a', work: { kind: 'review' } })).resolves.toEqual({ output: 'review started' });
    expect(begun).toEqual(['q1', 'q2']);
    expect(made.told).toEqual([]);
  });

  // `pane start --after 3a1ee233` was told there was no card to wait on.
  it('makes a short --after whole against the project\'s board, refusing one two cards start', async () => {
    const cards = [['card', 'Card'], ['cart', 'Cart'], ['zeta', 'Zeta']] as const;
    const board = cards.reduce((each, [id, title]) => addCard(each, { column: 0, card: 0 }, id, title).board, emptyBoard());
    const { actions, start } = pool({ board: () => board });
    actions.ready();
    await expect(start({ after: 'ze' })).resolves.toEqual({ output: 'queued q1, 1st: q1 waits on card zeta' });
    await expect(start({ after: 'car' })).resolves.toMatchObject({ refused: expect.stringContaining('more than one') });
  });

  it('queues everything until the restored panes are counted', async () => {
    const { actions, start, begun } = pool();
    await expect(start()).resolves.toEqual({ output: 'queued q1, 1st: the panes a restart brings back are not all back yet' });
    actions.ready();
    expect(begun).toEqual(['q1']);
  });

  it('starts at once under the cap and answers what the start answers, telling its main nothing', async () => {
    const { actions, start, finish, told } = pool();
    actions.ready();
    const answer = start();
    await finish('q1');
    await expect(answer).resolves.toEqual({ output: 'started q1' });
    expect(told).toEqual([]);
  });

  // The slot is taken before the start's first await: a ship's worktree takes minutes before its agent
  // is in a pane to count.
  it('holds a slot for each start under way, queues past the cap and starts the next when one settles', async () => {
    const { actions, start, finish, told, begun, counts, saves } = pool();
    actions.ready();
    void start();
    void start();
    await expect(start({ first: false })).resolves.toEqual({ output: 'queued q3, 1st: 2 running, the total cap is 2' });
    expect(begun).toEqual(['q1', 'q2']);
    expect(saves.at(-1)?.entries.map((each) => each.id)).toEqual(['q3']);
    // q1's agent is in its pane now, still holding the slot its start held.
    counts.running = 1;
    await finish('q1');
    expect(begun).toEqual(['q1', 'q2']);
    counts.running = 0;
    await finish('q2', { refused: 'card a has no worktree' });
    expect(begun).toEqual(['q1', 'q2', 'q3']);
    await finish('q3');
    expect(told).toEqual(['/work/api: q3 started: started q3']);
    expect(saves.at(-1)).toEqual({ next: 4, entries: [] });
  });

  it('puts --first at the head of the queue', async () => {
    const { actions, start } = pool({ cap: total(0) });
    actions.ready();
    await start();
    await expect(start({ first: true })).resolves.toEqual({ output: 'queued q2, 1st: 0 running, the total cap is 0' });
    const listed = await actions.queue.call({});
    expect('output' in listed && listed.output.split('\n').map((line) => line.split('\t')[0])).toEqual(['q2', 'q1', 'held: 0 running, the total cap is 0']);
  });

  it('tells a queued start\'s main when it did not start, and refuses a card queued twice', async () => {
    const { actions, start, finish, told } = pool({ cap: total(1) });
    actions.ready();
    void start();
    await start({ cardId: 'a', work: { kind: 'ship', title: 'A' } });
    await expect(start({ cardId: 'a', work: { kind: 'review' } })).resolves.toEqual({ refused: 'card a is already queued as q2' });
    await finish('q1');
    await finish('q2', { refused: 'commit or stash them first' });
    expect(told).toEqual(['/work/api: q2 did not start: commit or stash them first']);
  });

  it('drops a card finished while it waited, and tells its main', async () => {
    const { actions, start, told, board, begun, gone } = pool({ cap: total(0) });
    actions.ready();
    await start({ cardId: 'a', work: { kind: 'ship', title: 'A' } });
    board.columns[5].cards.push(board.columns[0].cards.splice(0, 1)[0]);
    actions.drain();
    expect(told).toEqual(['/work/api: q1 dropped: card a is Done']);
    expect(begun).toEqual([]);
    expect(gone).toEqual(['q1']);
  });

  // A board sync mid-write: the drain cannot read the card, so the ship waits for it, never dropped.
  it('holds a ship while its card file does not parse, and starts it once it does', async () => {
    const { actions, start, begun, gone, counts, board } = pool();
    actions.ready();
    counts.unreadable = true;
    board.columns[2].cards.push(board.columns[0].cards.splice(0, 1)[0]);
    await start({ cardId: 'a', returnTo: { from: 'Todo', into: 'Ship' }, work: { kind: 'ship', title: 'A' } });
    expect(begun).toEqual([]);
    expect(gone).toEqual([]);
    counts.unreadable = false;
    actions.drain();
    expect(begun).toEqual(['q1']);
  });

  // A withdrawal keeps its own read of the board, so its main hears why the card stays where it is.
  it('says why a card stays when withdrawn while a card file does not parse', async () => {
    const { actions, start, counts, moves, board } = pool();
    actions.ready();
    counts.unreadable = true;
    board.columns[2].cards.push(board.columns[0].cards.splice(0, 1)[0]);
    await start({ cardId: 'a', returnTo: { from: 'Todo', into: 'Ship' }, work: { kind: 'review' } });
    await expect(actions.unqueue.call({ id: 'q1', dispatcherPath: '/work/api' })).resolves.toEqual({ output: 'withdrew q1; card a stays: board files do not parse, nothing was written' });
    expect(moves).toEqual([]);
  });

  it('refuses what it cannot read', async () => {
    const { actions } = pool();
    await expect(actions.start.call({ dispatcherPath: '', projectPath: '/work/api' })).resolves.toEqual({ refused: 'no project was given' });
    await expect(actions.start.call({ dispatcherPath: '/work/api', projectPath: '/work/api', cardId: 3, after: null, first: false, work: { kind: 'review' } }))
      .resolves.toEqual({ refused: 'the start was not one the app could read' });
    await expect(actions.unqueue.call({ id: '' })).resolves.toEqual({ refused: 'pane unqueue needs the id pane queue prints' });
    await expect(actions.start.call({ dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, first: false, work: { kind: 'sing' } }))
      .resolves.toEqual({ refused: 'the start was not one the app could read' });
  });
});

describe('the pool\'s other doors', () => {
  it('puts a withdrawn card back in the column its move took it from, through card.move', async () => {
    const { actions, start, moves, board, gone } = pool({ cap: total(0) });
    actions.ready();
    board.columns[2].cards.push(board.columns[0].cards.splice(0, 1)[0]);
    await start({ cardId: 'a', returnTo: { from: 'Todo', into: 'Ship' }, work: { kind: 'ship', title: 'A' } });
    await expect(actions.unqueue.call({ id: 'q1', dispatcherPath: '/work/api' })).resolves.toEqual({ output: 'withdrew q1; card a back in Todo' });
    expect(moves).toEqual(['a Todo']);
    expect(gone).toEqual(['q1']);
  });

  it('says so when the move back is refused, and leaves a card the move did not queue alone', async () => {
    const { actions, start, moves, board } = pool({ cap: total(0), move: async () => ({ refused: 'board files do not parse' }) });
    actions.ready();
    board.columns[2].cards.push(board.columns[0].cards.splice(0, 1)[0]);
    await start({ cardId: 'a', returnTo: { from: 'Todo', into: 'Ship' }, work: { kind: 'ship', title: 'A' } });
    await expect(actions.unqueue.call({ id: 'q1', dispatcherPath: '/work/api' })).resolves.toEqual({ output: 'withdrew q1; card a stays: board files do not parse' });
    await start({ cardId: 'a', work: { kind: 'ship', title: 'A' } });
    await expect(actions.unqueue.call({ id: 'q2', dispatcherPath: '/work/api' })).resolves.toEqual({ output: 'withdrew q2' });
    expect(moves).toEqual([]);
  });

  it('refuses to withdraw an entry already starting', async () => {
    const { actions, start } = pool();
    actions.ready();
    void start();
    await expect(actions.unqueue.call({ id: 'q1', dispatcherPath: '/work/api' })).resolves.toEqual({ refused: 'q1 is already starting' });
  });

  it('holds a project at its own cap while another project\'s entry goes ahead, under the total', async () => {
    const { actions, start, counts, begun } = pool({ cap: () => ({ project: 1, total: 3 }) });
    actions.ready();
    counts.running = 1;
    await expect(start()).resolves.toEqual({ output: 'queued q1, 1st: q1 waits for a slot: 1 running in api, the cap per project is 1' });
    void start({ projectPath: '/work/crm' });
    expect(begun).toEqual(['q2']);
    expect(actions.full('/work/api')).toBe('1 running in api, the cap per project is 1: pane start queues the work until a worker frees');
    expect(actions.full('/work/crm')).toBe('1 running in crm, the cap per project is 1: pane start queues the work until a worker frees');
  });

  it('says why a start that never queues is refused at the cap', async () => {
    const { actions, start } = pool({ cap: total(1) });
    actions.ready();
    expect(actions.full('/work/api')).toBeNull();
    void start();
    expect(actions.full('/work/api')).toBe('1 running, the total cap is 1: pane start queues the work until a worker frees');
  });

  it('withdraws an entry for the main that queued it only, and lists an empty queue', async () => {
    const queued = { next: 8, entries: [{
      id: 'q7', dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, queuedAt: '2026-11-26T11:00:00.000Z',
      work: { kind: 'review' as const }, returnTo: null,
    }] };
    const { actions, saves } = pool({}, queued);
    await expect(actions.unqueue.call({ id: 'q7', dispatcherPath: '/work/crm' })).resolves.toEqual({ refused: 'q7 was queued by another project\'s main' });
    await expect(actions.unqueue.call({ id: 'q9', dispatcherPath: '/work/api' })).resolves.toEqual({ refused: 'nothing queued as q9' });
    await expect(actions.unqueue.call({ id: 'q7', dispatcherPath: '/work/api' })).resolves.toEqual({ output: 'withdrew q7' });
    expect(saves).toEqual([{ next: 8, entries: [] }]);
    await expect(actions.queue.call({})).resolves.toEqual({ output: 'nothing queued' });
  });
});
