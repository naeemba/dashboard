import { describe, expect, it } from 'vitest';
import { emptyBoard, moveCardById, type Board } from '../../shared/board/board';
import type { Settings } from '../../shared/settings/settings';
import { budgetHold, holdsSlot, nextToStart, ordinal, placed, queueRefusal, queueText, readiness, type QueueEntry, type Readiness } from './pane-pool';

const entry = (id: string, over: Partial<QueueEntry> = {}): QueueEntry => ({
  id, dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, queuedAt: '2026-11-26T12:00:00.000Z',
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

const ready: Readiness = { state: 'ready' };

describe('holdsSlot', () => {
  const look = { mainsWorker: true, state: undefined, paused: false, workIn: false };

  it('holds one for a worker running, blocked or paused on its own background work', () => {
    expect(holdsSlot(look)).toBe(true);
    expect(holdsSlot({ ...look, state: 'running' })).toBe(true);
    expect(holdsSlot({ ...look, state: 'blocked' })).toBe(true);
    expect(holdsSlot({ ...look, state: 'done', paused: true })).toBe(true);
  });

  it('frees it once done, or paused with its work in, and never holds one for what is no main\'s worker', () => {
    expect(holdsSlot({ ...look, state: 'done' })).toBe(false);
    expect(holdsSlot({ ...look, state: 'done', paused: true, workIn: true })).toBe(false);
    expect(holdsSlot({ ...look, mainsWorker: false })).toBe(false);
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
  it('drops an entry whose card is finished, and waits on a closed project or an unfinished --after card', () => {
    expect(readiness(entry('q1', { cardId: 'a' }), true, board({ a: DONE }))).toEqual({ state: 'drop', why: 'card a is Done' });
    expect(readiness(entry('q1', { cardId: 'a' }), true, board({ a: CANCELLED })).state).toBe('drop');
    expect(readiness(entry('q1'), false, null)).toEqual({ state: 'wait', why: 'api is not open' });
    expect(readiness(entry('q1', { after: 'b' }), true, board())).toEqual({ state: 'wait', why: 'waits on card b' });
    expect(readiness(entry('q1', { after: 'b' }), true, board({ b: DONE }))).toEqual(ready);
    expect(readiness(entry('q1', { cardId: 'a' }), true, board())).toEqual(ready);
  });

  it('does not wait on a closed project the start opens itself', () => {
    const elsewhere = entry('q1', { work: { kind: 'run', project: 'crm', prompt: 'p', card: null, worktree: false, folder: null, as: null } });
    expect(readiness(elsewhere, false, null)).toEqual(ready);
  });
});

describe('nextToStart', () => {
  const free = () => null;

  it('starts the first ready entry, skipping one that waits', () => {
    const waits = (each: QueueEntry): Readiness => (each.id === 'q1' ? { state: 'wait', why: 'waits on card b' } : ready);
    expect(nextToStart([entry('q1'), entry('q2')], 3, 4, free, waits)).toEqual({ start: entry('q2') });
    expect(nextToStart([entry('q1'), entry('q2')], 3, 4, free, () => ready)).toEqual({ start: entry('q1') });
    expect(nextToStart([entry('q1')], 3, 4, free, waits)).toEqual({ held: 'q1 waits on card b' });
  });

  it('holds at the cap, with no cap never, and on the budget', () => {
    expect(nextToStart([entry('q1')], 4, 4, free, () => ready)).toEqual({ held: '4 running, the cap is 4' });
    expect(nextToStart([entry('q1')], 9, null, free, () => ready)).toEqual({ start: entry('q1') });
    expect(nextToStart([entry('q1')], 0, 4, () => '81% used', () => ready)).toEqual({ held: '81% used' });
  });

  it('drops a finished entry whatever the slots, and has nothing to do for an empty queue', () => {
    const finished = (each: QueueEntry): Readiness => (each.id === 'q2' ? { state: 'drop', why: 'card a is Done' } : ready);
    expect(nextToStart([entry('q1'), entry('q2')], 4, 4, free, finished)).toEqual({ drop: entry('q2'), why: 'card a is Done' });
    expect(nextToStart([], 0, 4, free, () => ready)).toBeNull();
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
