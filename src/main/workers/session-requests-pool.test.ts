import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';

// The pane pool as the session command reaches it: `pane start`, `queue`, `unqueue`, the cap on
// `run`, and the slots its workers hold and free. The pool's own decisions are pane-pool.test.ts's
// and queue.test.ts's.

const NOTHING_WAITING = { background: 0, scheduled: 0 };
const settled = () => new Promise((resolve) => setImmediate(resolve));

function capped(cap: number) {
  const fake = project();
  fake.ports.pool = { ...fake.ports.pool, cap: () => cap };
  const answer = sessionRequests(fake.ports);
  answer.pool.ready();
  const ask = (args: string[]) => answer({ directory: '/work/api', args });
  return { ...fake, answer, ask };
}

describe('pane start', () => {
  it('claims a pane and runs in it at once under the cap', async () => {
    const { ask, started } = capped(1);
    expect(await ask(['start', '--worktree', 'fix it'])).toMatchObject({ ok: true, output: expect.stringContaining('in 2:1, in /work/api.worktrees/fix-the-tests') });
    expect(started).toMatchObject([{ id: '2:1', prompt: 'fix it', dispatcherPath: '/work/api' }]);
  });

  it('queues past the cap, refuses run there, and starts the queued one when a worker is done', async () => {
    const { ask, answer, started, told } = capped(1);
    await ask(['start', 'first task']);
    expect(await ask(['start', 'second task'])).toEqual({ ok: true, output: 'queued q2, 1st: 1 running, the cap is 1' });
    expect(await ask(['run', '2:1', 'more'])).toEqual({ ok: false, output: '1 running, the cap is 1: pane start queues the work until a worker frees' });
    expect((await ask(['queue'])).output).toMatch(/^q2\t1st\tapi\trun second task\t/);
    // Blocked on a question, it still holds its slot.
    answer.notify('2:1', 'blocked');
    expect(started).toHaveLength(1);
    answer.notify('2:1', 'done', NOTHING_WAITING);
    await settled();
    expect(started).toMatchObject([{ id: '2:1' }, { id: '2:2', prompt: 'second task' }]);
    expect(told).toContainEqual(expect.stringMatching(/^2 q2 started: started api-.* in 2:2/));
  });

  it('keeps a worker paused on its own background work in its slot', async () => {
    const { ask, answer, started } = capped(1);
    await ask(['start', 'first task']);
    await ask(['start', 'second task']);
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    await settled();
    expect(started).toHaveLength(1);
  });

  it('releases the pane it claimed for a run that is refused', async () => {
    const { ask, closed } = capped(1);
    expect(await ask(['start', '--card', 'card-9', 'work it'])).toEqual({ ok: false, output: 'card card-9 has no worktree — moving it to Ship makes one' });
    expect(closed).toEqual(['2:1']);
  });

  it('refuses a --project projects.yaml does not have, and resolves --in from the asking folder', async () => {
    const { ask, started } = capped(1);
    expect(await ask(['start', '--project', 'nowhere', 'look'])).toEqual({ ok: false, output: 'no project is called nowhere' });
    await ask(['start', '--in', 'packages/web', 'look']);
    expect(started).toMatchObject([{ id: '2:1', directory: path.resolve('/work/api/packages/web') }]);
  });

  it('withdraws what this project queued', async () => {
    const { ask } = capped(0);
    await ask(['start', 'task']);
    expect(await ask(['unqueue', 'q1'])).toEqual({ ok: true, output: 'withdrew q1' });
    expect(await ask(['queue'])).toEqual({ ok: true, output: 'nothing queued' });
  });

  // The workers popup's read of the queue and its withdraw key.
  it('lists the queue for the popup by the slot that queued it, and withdraws for that slot only', async () => {
    const { ask, answer } = capped(0);
    await ask(['start', 'task']);
    expect(answer.queued()).toEqual([{ id: 'q1', dispatcher: 2, project: 'api', place: '1st', about: 'run task', after: null }]);
    expect(await answer.unqueue(9, 'q1')).toEqual({ refused: 'that page is not open' });
    expect(await answer.unqueue(2, 'q1')).toEqual({ output: 'withdrew q1' });
    expect(answer.queued()).toEqual([]);
  });
});

describe('a ship or a review the board command starts', () => {
  // The manager's `board ship <id> --project crm`: its main is told how the start goes, and may withdraw it.
  it('belongs to the main of the page the command ran in, else to the card\'s project\'s', async () => {
    const { answer, ask } = capped(0);
    const ship = { projectPath: '/work/crm', cardId: 'c', after: null, first: false, returnTo: null, work: { kind: 'ship', title: 'C' } } as const;
    expect(await answer.startCard({ ...ship, askedFrom: '/work/api/packages' })).toEqual({ output: 'queued q1, 1st: 0 running, the cap is 0' });
    expect(await answer.startCard({ ...ship, cardId: 'd', askedFrom: null })).toEqual({ output: 'queued q2, 2nd: 0 running, the cap is 0' });
    expect(await ask(['unqueue', 'q1'])).toEqual({ ok: true, output: 'withdrew q1' });
    expect(await ask(['unqueue', 'q2'])).toEqual({ ok: false, output: 'q2 was queued by another project\'s main' });
  });
});
