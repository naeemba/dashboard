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
  fake.ports.pool = { ...fake.ports.pool, cap: () => ({ project: null, total: cap }) };
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
    expect(await ask(['start', 'second task'])).toEqual({ ok: true, output: 'queued q2, 1st: 1 running, the total cap is 1' });
    expect(await ask(['run', '2:1', 'more'])).toEqual({ ok: false, output: '1 running, the total cap is 1: pane start queues the work until a worker frees' });
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

  // A pane main claimed --project crm counts against crm, the page it is on, as start counts it.
  it('refuses run into a pane on another project\'s page at that project\'s cap', async () => {
    const paths = new Map([[2, '/work/api'], [3, '/work/crm']]);
    const fake = project({
      slotOf: (directory) => [...paths].find(([, folder]) => directory.startsWith(folder))?.[0] ?? -1,
      projectPath: (slot) => paths.get(slot),
      openSlots: () => [{ slot: 2, name: 'api' }, { slot: 3, name: 'crm' }],
      findProject: (word) => (word === 'crm' ? { ok: true, name: 'crm', path: '/work/crm' } : { ok: false, message: `no project is called ${word}` }),
      openProject: async () => 3,
    });
    fake.ports.pool = { ...fake.ports.pool, cap: () => ({ project: 1, total: 8 }) };
    const answer = sessionRequests(fake.ports);
    answer.pool.ready();
    const ask = (args: string[]) => answer({ directory: '/work/api', args });
    await ask(['start', '--project', 'crm', 'first task']);
    const claimed = (await ask(['claim', '--project', 'crm'])).output;
    expect(await ask(['run', claimed, 'more'])).toMatchObject({ ok: false, output: expect.stringContaining('pane start queues the work') });
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
    expect(await answer.startCard({ ...ship, askedFrom: '/work/api/packages' })).toEqual({ output: 'queued q1, 1st: 0 running, the total cap is 0' });
    expect(await answer.startCard({ ...ship, cardId: 'd', askedFrom: null })).toEqual({ output: 'queued q2, 2nd: 0 running, the total cap is 0' });
    expect(await ask(['unqueue', 'q1'])).toEqual({ ok: true, output: 'withdrew q1' });
    expect(await ask(['unqueue', 'q2'])).toEqual({ ok: false, output: 'q2 was queued by another project\'s main' });
  });
});

describe('a CI wait', () => {
  it('gives a paused worker\'s slot back, and takes it back ahead of the queue once CI is done', async () => {
    const { ask, answer, started } = capped(1);
    await ask(['start', 'first task']);
    await ask(['start', 'second task']);
    expect(await ask(['ci', '2:1', 'wait', '41'])).toEqual({ ok: true, output: '' });
    // Its turn ends with the wait in the background: the slot goes to the queued start.
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    await settled();
    expect(started).toMatchObject([{ id: '2:1' }, { id: '2:2', prompt: 'second task' }]);
    let back = false;
    void ask(['ci', '2:1', 'resume', '41']).then(() => { back = true; });
    await settled();
    expect(back).toBe(false);
    answer.notify('2:2', 'done', NOTHING_WAITING);
    await settled();
    expect(back).toBe(true);
  });

  // A wait whose process id another process took up reads as live: the next Stop's background count
  // drops it, so the worker's own background work holds the slot again.
  it('stops counting a wait the Stop hook no longer sees in the background', async () => {
    const { ask, answer, started } = capped(1);
    await ask(['start', 'first task']);
    await ask(['ci', '2:1', 'wait', '41']);
    answer.notify('2:1', 'done', NOTHING_WAITING);
    answer.notify('2:1', 'running');
    await ask(['start', 'second task']);
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    await settled();
    expect(answer.pool.ciWaits('2:1')).toBe(0);
    expect(started).toHaveLength(1);
  });

  // Two waits, one killed: a Stop seeing one background task keeps the live wait.
  it('lowers the count to the background a Stop reports, not to none', async () => {
    const { ask, answer } = capped(1);
    await ask(['start', 'first task']);
    await ask(['ci', '2:1', 'wait', '41']);
    await ask(['ci', '2:1', 'wait', '42']);
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    expect(answer.pool.ciWaits('2:1')).toBe(1);
  });

  // workers-decision-11: main's own `pr wait` and `pr land` never wait on the pool, however full.
  it('changes nothing for main and never holds its resume', async () => {
    const { ask } = capped(0);
    expect(await ask(['ci', '2:0', 'wait', '41'])).toEqual({ ok: true, output: '' });
    expect(await ask(['ci', '2:0', 'resume', '41'])).toEqual({ ok: true, output: '' });
  });
});
