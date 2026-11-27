import { describe, expect, it } from 'vitest';
import type { QueueEntry } from '../../workers/pane-pool';
import { panePool } from './queue';

// One project, api, under a cap of 1 per project. 2:1 is a main's worker paused on its background work,
// which holds a slot unless all of it is CI waits, as holdsSlot reads it; 2:0 is main itself, no
// worker. `holding` is the other panes holding a slot.
function pool() {
  const holding = new Set<string>();
  const begun: string[] = [];
  const holds = (id: string) => holding.has(id) || (id === '2:1' && actions.ciWaits(id) === 0);
  const actions = panePool({ next: 1, entries: [] }, {
    save: () => undefined,
    running: () => new Map([['/work/api', ['2:1', ...holding].filter(holds).length]]),
    cap: () => ({ project: 1, total: 8 }),
    worker: (id) => (id === '2:1' ? '/work/api' : null),
    holds,
    budget: () => null,
    open: () => true,
    board: () => null,
    drainBoard: () => null,
    begin: (entry: QueueEntry) => { begun.push(entry.id); return new Promise(() => undefined); },
    tell: () => undefined,
    now: () => 0,
    move: async () => ({ output: '' }),
    gone: () => undefined,
  });
  actions.ready();
  const start = () => actions.start.call({
    dispatcherPath: '/work/api', projectPath: '/work/api', cardId: null, after: null, first: false,
    work: { kind: 'run', project: null, prompt: 'fix it', card: null, worktree: false, folder: null, as: null },
  });
  return { actions, holding, begun, start };
}

// Settled now, or still waiting, after the microtasks a drain runs in.
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => { done = true; });
  await new Promise((resolve) => setImmediate(resolve));
  return done;
}

describe('pane.ci-wait and pane.ci-resume', () => {
  // workers-decision-11: main's own `pr land` never waits on the pool, however full it is.
  it('change nothing and answer at once for main, or any pane that is no main\'s worker', async () => {
    const { actions } = pool();
    await expect(actions.ciWait.call({ id: '2:0' })).resolves.toEqual({ output: '' });
    expect(actions.ciWaits('2:0')).toBe(0);
    expect(await settled(actions.ciResume.call({ id: '2:0' }))).toBe(true);
    await expect(actions.ciWait.call({})).resolves.toEqual({ refused: 'the CI wait needs the pane it runs in' });
  });

  it('count a worker\'s wait, and give the slot back at once while it holds one anyway', async () => {
    const { actions, holding } = pool();
    // Running in the foreground: it holds its slot through the wait.
    holding.add('2:1');
    await actions.ciWait.call({ id: '2:1' });
    await actions.ciWait.call({ id: '2:1' });
    expect(actions.ciWaits('2:1')).toBe(2);
    expect(await settled(actions.ciResume.call({ id: '2:1' }))).toBe(true);
    expect(actions.ciWaits('2:1')).toBe(1);
  });

  it('hold a resume until there is room, ahead of a queued start', async () => {
    const { actions, holding, begun, start } = pool();
    await actions.ciWait.call({ id: '2:1' });
    // Its slot given back, another worker took it, and a start queued behind that.
    holding.add('2:2');
    await start();
    const resumed = actions.ciResume.call({ id: '2:1' });
    expect(await settled(resumed)).toBe(false);
    holding.delete('2:2');
    actions.drain();
    expect(await settled(resumed)).toBe(true);
    // Back in its slot, the worker holds the cap of 1 again: the queued start still waits.
    expect(actions.ciWaits('2:1')).toBe(0);
    expect(begun).toEqual([]);
  });

  it('answer a resume with nothing given back at once, and forget a pane run again', async () => {
    const { actions } = pool();
    expect(await settled(actions.ciResume.call({ id: '2:1' }))).toBe(true);
    await actions.ciWait.call({ id: '2:1' });
    actions.forget('2:1');
    expect(actions.ciWaits('2:1')).toBe(0);
  });
});
