import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { doneReport } from '../../shared/workers/done-report';
import { REPORT_SETTLE_MS } from './stop-notices';

// What main hears of a worker's turns beyond whether it stopped: its last message, and nothing at all
// of a turn you typed into it yourself. stop-notices.test.ts holds when a stop is told.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const NOTHING_WAITING = { background: 0, scheduled: 0 };

async function running(...args: Parameters<typeof project>) {
  const fake = project(...args);
  const answer = sessionRequests(fake.ports);
  await answer({ directory: '/work/api', args: ['claim'] });
  await answer({ directory: '/work/api', args: ['run', '2:1', 'fix the tests'] });
  // The prompt it was started on.
  answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
  return { ...fake, answer };
}

const stop = (answer: ReturnType<typeof sessionRequests>, lastMessage?: string) => {
  answer.notify('2:1', 'done', NOTHING_WAITING, lastMessage === undefined ? {} : { lastMessage });
  vi.advanceTimersByTime(REPORT_SETTLE_MS);
};

describe('a worker\'s turns, as main hears them', () => {
  it('tells main the tail of the worker\'s last message with its stop', async () => {
    const { answer, told } = await running();
    stop(answer, 'Opened #12.\n\nTests pass.');
    expect(told).toEqual([`2 ${doneReport('api-terminal-2', '2:1', false, 'Opened #12.\n\nTests pass.')}`]);
    expect(told[0]).toMatch(/Its last message: Opened #12\. Tests pass\.$/);
  });

  it('tells main nothing of a turn you typed into the worker, and again once main sends it work', async () => {
    const { answer, told } = await running();
    stop(answer, 'first');
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    stop(answer, 'answered you');
    expect(told).toHaveLength(1);
    // The worker waking itself on a task notification is still your turn.
    answer.notify('2:1', 'running', undefined, { promptSource: 'system' });
    stop(answer, 'still yours');
    expect(told).toHaveLength(1);
    await answer({ directory: '/work/api', args: ['send', '2:1', 'now merge it'] });
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    stop(answer, 'merged');
    expect(told).toHaveLength(2);
    expect(told[1]).toContain('Its last message: merged');
  });

  it('reports a worker\'s line and its last message, kept while it works again', async () => {
    const { answer } = await running();
    expect(await answer({ directory: '/work/api', args: ['report', '2:1'] })).toEqual({
      ok: true, output: '2:1\tterminal 2\trunning\t/work/api\n\nIt has not ended a turn since it was started.',
    });
    stop(answer, 'Opened #12.');
    answer.notify('2:1', 'running', undefined, { promptSource: 'system' });
    expect(await answer({ directory: '/work/api', args: ['report', '2:1'] })).toEqual({
      ok: true, output: '2:1\tterminal 2\trunning\t/work/api\n\nOpened #12.',
    });
    expect(await answer({ directory: '/work/api', args: ['report', '2:0'] })).toMatchObject({ ok: false });
  });

  it('forgets the last message once the pane is run again', async () => {
    const { answer } = await running();
    stop(answer, 'Opened #12.');
    await answer({ directory: '/work/api', args: ['release', '2:1'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'next task'] });
    expect((await answer({ directory: '/work/api', args: ['report', '2:1'] })).output).toContain('has not ended a turn');
  });
});
