import { describe, expect, it } from 'vitest';
import { emptyBoard, moveCardById, type Board } from '../../shared/board/board';
import type { Settings } from '../../shared/settings/settings';
import { budgetHold, capReached, holdsSlot, nextResume, withdrawnColumn, nextToStart, ordinal, placed, queueRefusal, queueText, readiness, type QueueEntry, type Readiness, type Resumer } from './pane-pool';

const entry = (id: string, over: Partial<QueueEntry> = {}): QueueEntry => ({
  id, dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, returnTo: null, queuedAt: '2026-11-26T12:00:00.000Z',
  work: { kind: 'run', project: null, prompt: 'fix the tests', card: null, worktree: true, folder: null, as: null }, ...over,
});

// A board with cards a and b in Backlog, each moved to the column given.
function board(columns: Record<string, number> = {}): Board {
  const empty = emptyBoard();
  let made: Board = {
    columns: empty.columns.map((column, at) => (at === 0
      ? { ...column, cards: ['a', 'b'].map((id) => ({ id, title: id, notes: '', priority: 'medium' as const, parent: null })) }
      : column)),
  };
  for (const [id, column] of Object.entries(columns)) made = moveCardById(made, id, column) ?? made;
  return made;
}
const DONE = 5;
const CANCELLED = 6;

const ready: Readiness = { state: 'ready', why: '' };

describe('holdsSlot', () => {
  const look = { mainsWorker: true, state: undefined, waiting: undefined, workIn: false, ciWaits: 0 };
  const paused = { background: 1, scheduled: 0 };

  it('holds one for a worker running, blocked or paused on its own background work', () => {
    expect(holdsSlot(look)).toBe(true);
    expect(holdsSlot({ ...look, state: 'running' })).toBe(true);
    expect(holdsSlot({ ...look, state: 'blocked' })).toBe(true);
    expect(holdsSlot({ ...look, state: 'done', waiting: paused })).toBe(true);
  });

  it('frees it once done, or paused with its work in, and never holds one for what is no main\'s worker', () => {
    expect(holdsSlot({ ...look, state: 'done' })).toBe(false);
    expect(holdsSlot({ ...look, state: 'done', waiting: paused, workIn: true })).toBe(false);
    expect(holdsSlot({ ...look, mainsWorker: false })).toBe(false);
  });

  // workers-decision-11: a CI wait gives its slot back, a test run beside it keeps it.
  it('frees it while a pause\'s only background work is waiting on CI, and never for one running', () => {
    expect(holdsSlot({ ...look, state: 'done', waiting: paused, ciWaits: 1 })).toBe(false);
    expect(holdsSlot({ ...look, state: 'done', waiting: { background: 1, scheduled: 1 }, ciWaits: 1 })).toBe(false);
    expect(holdsSlot({ ...look, state: 'done', waiting: { background: 2, scheduled: 0 }, ciWaits: 1 })).toBe(true);
    expect(holdsSlot({ ...look, state: 'running', ciWaits: 1 })).toBe(true);
  });
});

describe('capReached and nextResume', () => {
  const caps = { project: 2, total: 3 };
  const running = new Map([['/work/api', 2], ['/work/crm', 1]]);

  it('says which cap is reached, the total first, none with no caps', () => {
    expect(capReached(new Map([['/work/api', 2]]), caps, '/work/api')).toBe('2 running in api, the cap per project is 2');
    expect(capReached(new Map([['/work/api', 2]]), caps, '/work/crm')).toBeNull();
    expect(capReached(running, caps, '/work/crm')).toBe('3 running, the total cap is 3');
    expect(capReached(running, { project: null, total: null }, '/work/api')).toBeNull();
  });

  it('lets on the first resumer with room, one holding a slot anyway, or one no longer a worker', () => {
    const roomy = new Map([['/work/api', 2]]);
    const same = (resumer: Resumer) => resumer;
    expect(nextResume([{ projectPath: '/work/api', holds: false }, { projectPath: '/work/crm', holds: false }], same, roomy, caps)).toBe(1);
    expect(nextResume([{ projectPath: '/work/api', holds: true }], same, running, caps)).toBe(0);
    expect(nextResume([{ projectPath: null, holds: false }], same, running, caps)).toBe(0);
    expect(nextResume([{ projectPath: '/work/crm', holds: false }], same, running, caps)).toBe(-1);
  });
});

describe('budgetHold', () => {
  const verdict = (exitCode: 0 | 1 | 2) => () => ({ exitCode, line: `exit ${exitCode}` });
  const budget = (over: Partial<Settings['budget']>): Settings['budget'] => ({ limit: 'cap', weeklyCap: 80, dailyShare: null, ...over });

  // A fresh install's: the verdict would be 2, and its first worker past the cap would never start.
  it('never holds with no limit configured, and never reads the usage then', () => {
    const unread = () => { throw new Error('read'); };
    expect(budgetHold(budget({ weeklyCap: null }), unread)).toBeNull();
    expect(budgetHold(budget({ limit: 'none' }), unread)).toBeNull();
  });

  it('holds over the limit and on a stale reading, saying why', () => {
    expect(budgetHold(budget({}), verdict(0))).toBeNull();
    expect(budgetHold(budget({}), verdict(1))).toBe('exit 1');
    expect(budgetHold(budget({ limit: 'pace' }), verdict(2))).toBe('exit 2');
  });
});

describe('readiness', () => {
  const open = () => true;
  it('drops an entry whose card is finished, and waits on a closed project or an unfinished --after card', () => {
    expect(readiness(entry('q1', { cardId: 'a' }), open, () => board({ a: DONE }))).toEqual({ state: 'drop', why: 'card a is Done' });
    expect(readiness(entry('q1', { cardId: 'a' }), open, () => board({ a: CANCELLED })).state).toBe('drop');
    expect(readiness(entry('q1'), () => false, () => null)).toEqual({ state: 'wait', why: 'api is not open' });
    expect(readiness(entry('q1', { after: 'b' }), open, () => board())).toEqual({ state: 'wait', why: 'waits on card b' });
    expect(readiness(entry('q1', { after: 'b' }), open, () => board({ b: DONE }))).toEqual(ready);
    expect(readiness(entry('q1', { cardId: 'a' }), open, () => board())).toEqual(ready);
  });

  it('holds a ship or a review on a board it cannot read, never dropping it', () => {
    const ship = entry('q1', { cardId: 'a', work: { kind: 'ship', title: 'A' } });
    expect(readiness(ship, open, () => null)).toEqual({ state: 'wait', why: 'the board of api cannot be read' });
    // No card means no board was read: it goes on to begin, which refuses it.
    expect(readiness(entry('q1', { work: { kind: 'ship', title: 'A' } }), open, () => null)).toEqual(ready);
  });

  it('does not wait on a closed project the start opens itself', () => {
    const elsewhere = entry('q1', { projectPath: '/work/crm', work: { kind: 'run', project: 'crm', prompt: 'p', card: null, worktree: false, folder: null, as: null } });
    expect(readiness(elsewhere, (path) => path === '/work/api', () => null)).toEqual(ready);
  });

  // Its main is the one told how the start went: started now, nobody would hear it.
  it('waits while the page of the main that queued it is closed', () => {
    const elsewhere = entry('q1', { projectPath: '/work/crm', work: { kind: 'run', project: 'crm', prompt: 'p', card: null, worktree: false, folder: null, as: null } });
    expect(readiness(elsewhere, (path) => path === '/work/crm', () => null)).toEqual({ state: 'wait', why: 'api is not open' });
  });

  it('drops an entry whose card was deleted, and leaves it be when the board cannot be read', () => {
    expect(readiness(entry('q1', { cardId: 'c' }), open, () => board())).toEqual({ state: 'drop', why: 'card c is not on the board' });
    expect(readiness(entry('q1', { cardId: 'c' }), open, () => null)).toEqual(ready);
  });

  // Dragged into Ship, queued, then dragged back out: not shipped from Todo twenty minutes later.
  it('drops an entry whose card left the column its move put it in', () => {
    const shipped = entry('q1', { cardId: 'a', returnTo: { from: 'Backlog', into: 'Ship' }, work: { kind: 'ship', title: 'a' } });
    expect(readiness(shipped, open, () => board())).toEqual({ state: 'drop', why: 'card a left Ship' });
    expect(readiness(shipped, open, () => board({ a: 2 }))).toEqual(ready);
  });
});

describe('nextToStart', () => {
  const free = () => null;
  const caps = (project: number | null, total: number | null = null) => ({ project, total });
  const api = (count: number) => new Map([['/work/api', count]]);

  it('starts the first ready entry, skipping one that waits', () => {
    const waits = (each: QueueEntry): Readiness => (each.id === 'q1' ? { state: 'wait', why: 'waits on card b' } : ready);
    expect(nextToStart([entry('q1'), entry('q2')], api(3), caps(4), free, waits)).toEqual({ start: entry('q2') });
    expect(nextToStart([entry('q1'), entry('q2')], api(3), caps(4), free, () => ready)).toEqual({ start: entry('q1') });
    expect(nextToStart([entry('q1')], api(3), caps(4), free, waits)).toEqual({ held: 'q1 waits on card b' });
  });

  it('holds at the total cap, with no cap never, and on the budget', () => {
    expect(nextToStart([entry('q1')], api(4), caps(null, 4), free, () => ready)).toEqual({ held: '4 running, the total cap is 4' });
    expect(nextToStart([entry('q1')], api(9), caps(null), free, () => ready)).toEqual({ start: entry('q1') });
    expect(nextToStart([entry('q1')], api(0), caps(4), () => '81% used', () => ready)).toEqual({ held: '81% used' });
  });

  it('lets another project\'s entry past one whose project is at its cap', () => {
    const crm = entry('q2', { projectPath: '/work/crm' });
    expect(nextToStart([entry('q1'), crm], api(4), caps(4, 8), free, () => ready)).toEqual({ start: crm });
    expect(nextToStart([entry('q1')], api(4), caps(4, 8), free, () => ready)).toEqual({ held: 'q1 waits for a slot: 4 running in api, the cap per project is 4' });
  });

  it('drops a finished entry whatever the slots, and has nothing to do for an empty queue', () => {
    const finished = (each: QueueEntry): Readiness => (each.id === 'q2' ? { state: 'drop', why: 'card a is Done' } : ready);
    expect(nextToStart([entry('q1'), entry('q2')], api(4), caps(4, 4), free, finished)).toEqual({ drop: entry('q2'), why: 'card a is Done' });
    expect(nextToStart([], api(0), caps(4), free, () => ready)).toEqual({ held: null });
  });
});

describe('queueing', () => {
  it('refuses a card queued twice and an --after card the board does not have', () => {
    expect(queueRefusal([entry('q1', { cardId: 'a' })], entry('q2', { cardId: 'a' }), board())).toBe('card a is already queued as q1');
    expect(queueRefusal([], entry('q2', { after: 'z' }), board())).toBe('no card z on the board to wait on');
    expect(queueRefusal([entry('q1', { cardId: 'a' })], entry('q2', { cardId: 'b', after: 'a' }), board())).toBeNull();
  });

  it('puts an entry at the back, or the head with --first', () => {
    expect(placed([entry('q1')], entry('q2'), false).map((each) => each.id)).toEqual(['q1', 'q2']);
    expect(placed([entry('q1')], entry('q2'), true).map((each) => each.id)).toEqual(['q2', 'q1']);
  });

  it('names positions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '111th']);
  });

  it('lists the queue in order with why it is held', () => {
    const ship = entry('q7', { cardId: 'a', after: 'b', work: { kind: 'ship', title: 'Pane pool' } });
    const now = Date.parse('2026-11-26T12:04:00.000Z');
    expect(queueText([entry('q6'), ship], '4 running, the cap is 4', now).split('\n')).toEqual([
      'q6\t1st\tapi\trun fix the tests\tqueued 4 minutes ago',
      'q7\t2nd\tapi\tship a "Pane pool"\tqueued 4 minutes ago\tafter b',
      'held: 4 running, the cap is 4',
    ]);
    expect(queueText([], null, now)).toBe('nothing queued');
  });
});

describe('withdrawnColumn', () => {
  const SHIP = 2;
  const REVIEW = 4;
  const shipped = entry('q1', { cardId: 'a', returnTo: { from: 'Backlog', into: 'Ship' }, work: { kind: 'ship', title: 'A' } });

  it('puts a card the move queued back where it came from', () => {
    expect(withdrawnColumn(shipped, board({ a: SHIP }))).toEqual({ back: 'Backlog' });
  });

  it('leaves a card moved on since, one no move queued, and one with no card', () => {
    expect(withdrawnColumn(shipped, board({ a: DONE }))).toBeNull();
    expect(withdrawnColumn({ ...shipped, returnTo: null }, board({ a: SHIP }))).toBeNull();
    expect(withdrawnColumn(entry('q2'), board())).toBeNull();
    expect(withdrawnColumn(shipped, null)).toBeNull();
  });

  // A reviewed card shipped again, withdrawn: back in Review would start the review over.
  it('keeps a card out of a column whose entry starts something, saying so', () => {
    const fromReview = { ...shipped, returnTo: { from: 'Review', into: 'Ship' } };
    expect(withdrawnColumn(fromReview, board({ a: SHIP }))).toEqual({ stays: 'card a stays in Ship: back in Review would start it again' });
    expect(withdrawnColumn({ ...shipped, returnTo: { from: 'Doing', into: 'Review' } }, board({ a: REVIEW }))).toEqual({ back: 'Doing' });
  });
});
