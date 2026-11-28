import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project, rowOf } from './session-requests-fixture';
import { isDoneReport, stallNotice } from '../../shared/workers/done-report';

// stall.test.ts holds the clock; this is what a stall does to `pane list`, `pane status` and main.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const minutes = (count: number) => vi.advanceTimersByTime(count * 60_000);

async function silentWorker() {
  const fake = project();
  const answer = sessionRequests(fake.ports);
  await answer({ directory: '/work/api', args: ['claim'] });
  await answer({ directory: '/work/api', args: ['run', '2:1', 'run the tests'] });
  answer.notify('2:1', 'running', undefined, { handed: true });
  const list = async () => (await answer({ directory: '/work/api', args: ['list'] })).output;
  return { ...fake, answer, list };
}

describe('a worker gone silent', () => {
  it('is listed stalled once no hook has spoken for the setting\'s minutes, and running again after one does', async () => {
    const { answer, list } = await silentWorker();
    minutes(19);
    expect(await list()).toContain('2:1\tterminal 2\trunning');
    // What says the sweep redraws the workers popup.
    expect(answer.tellStalls()).toBe(false);
    minutes(6);
    expect(answer.tellStalls()).toBe(true);
    expect(await list()).toContain('2:1\tterminal 2\tstalled, silent 25 minutes');
    expect((await answer({ directory: '/work/api', args: ['status'] })).output).toContain('stalled, silent 25 minutes');
    expect(answer.workers()[0]).toMatchObject({ status: 'stalled', detail: 'stalled, silent 25 minutes' });
    answer.notify('2:1', 'running');
    expect(await list()).toContain('2:1\tterminal 2\trunning');
    expect(answer.workers()[0]).toMatchObject({ status: 'working' });
    expect(answer.workers()[0]).not.toHaveProperty('detail');
  });

  it('tells main once per stall, and keeps the pane', async () => {
    const { answer, told, closed } = await silentWorker();
    minutes(20);
    answer.tellStalls();
    answer.tellStalls();
    expect(told).toEqual([`2 ${stallNotice('api-terminal-2', '2:1', 20, rowOf('2:1', 'stalled, silent 20 minutes'))}`]);
    expect(closed).toEqual([]);
    // Drawn as a status line, not a prompt you typed.
    expect(isDoneReport(stallNotice('api-terminal-2', '2:1', 20, rowOf('2:1', 'stalled, silent 20 minutes')))).toBe(true);
    answer.notify('2:1', 'running');
    minutes(21);
    answer.tellStalls();
    expect(told).toHaveLength(2);
  });

  it('is listed stalled but not told on a turn you typed into the worker yourself', async () => {
    const { answer, told, list } = await silentWorker();
    // The first typed prompt is the one main started it on; the next is yours (prompt-source.ts).
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    minutes(20);
    answer.tellStalls();
    expect(await list()).toContain('stalled, silent 20 minutes');
    expect(told).toEqual([]);
  });

  it.each([
    ['blocked', undefined, '2:1\tterminal 2\tblocked'],
    ['done', undefined, '2:1\tterminal 2\tdone'],
    ['done', { background: 1, scheduled: 0 }, '2:1\tterminal 2\tpaused, '],
  ] as const)('is never a worker %s (waiting %o), whose silence is waiting', async (state, waiting, listed) => {
    const { answer, told, list } = await silentWorker();
    answer.notify('2:1', state, waiting);
    minutes(25);
    answer.tellStalls();
    expect(await list()).toContain(listed);
    expect(told.filter((each) => each.includes('no sign of life'))).toEqual([]);
  });

  it('has a worker paused on its own background work at work, and one done or unknown not', async () => {
    const { answer } = await silentWorker();
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    expect(answer.pausedAtWork('2:1', Date.now())).toBe(true);
    answer.notify('2:1', 'done');
    expect(answer.pausedAtWork('2:1', Date.now())).toBe(false);
    expect(answer.pausedAtWork('2:2', Date.now())).toBe(false);
  });

  it('takes the notice back when the worker speaks again before main reads it', async () => {
    const { answer, told, withdrawn } = await silentWorker();
    minutes(20);
    answer.tellStalls();
    answer.notify('2:1', 'running');
    expect(withdrawn).toEqual([`2 ${told.length - 1}`]);
  });

  it('takes the notice back when main lets go of the worker before reading it', async () => {
    const { answer, told, withdrawn } = await silentWorker();
    minutes(20);
    answer.tellStalls();
    const stallId = told.length - 1;
    await answer({ directory: '/work/api', args: ['release', '2:1'] });
    expect(withdrawn).toContain(`2 ${stallId}`);
  });

  it('is never a worker resumed after a restart that no hook has spoken for', async () => {
    const fake = project();
    const answer = sessionRequests(fake.ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    // Resumed with no prompt: main's worker, and no hook has run for it.
    fake.agents.add('2:1');
    fake.workers.set('2:1', '/work/api');
    answer.tellStalls();
    minutes(21);
    answer.tellStalls();
    expect(fake.told.filter((each) => each.includes('no sign of life'))).toEqual([]);
    expect((await answer({ directory: '/work/api', args: ['list'] })).output).toContain('2:1\tterminal 2\trunning');
  });
});
