import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { stallNotice } from './stall';

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
    minutes(6);
    expect(await list()).toContain('2:1\tterminal 2\tstalled, silent 25 minutes');
    expect((await answer({ directory: '/work/api', args: ['status'] })).output).toContain('stalled, silent 25 minutes');
    answer.notify('2:1', 'running');
    expect(await list()).toContain('2:1\tterminal 2\trunning');
  });

  it('tells main once per stall, and keeps the pane', async () => {
    const { answer, told, closed } = await silentWorker();
    minutes(20);
    answer.tellStalls();
    answer.tellStalls();
    expect(told).toEqual([`2 ${stallNotice('api-terminal-2', '2:1', 20)}`]);
    expect(closed).toEqual([]);
    answer.notify('2:1', 'running');
    minutes(21);
    answer.tellStalls();
    expect(told).toHaveLength(2);
  });

  it('is never a worker blocked, done or paused, whose silence is waiting', async () => {
    const { answer, told, list } = await silentWorker();
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    minutes(25);
    answer.tellStalls();
    expect(await list()).toContain('paused');
    expect(told.filter((each) => each.includes('no sign of life'))).toEqual([]);
  });
});
