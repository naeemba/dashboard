import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { gaveUpText } from './turn-failures';

// turn-failures.test.ts holds the schedule; this is where its `continue` goes, and who is told.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const minutes = (count: number) => vi.advanceTimersByTime(count * 60_000);

async function worker() {
  const fake = project();
  const answer = sessionRequests(fake.ports);
  await answer({ directory: '/work/api', args: ['claim'] });
  await answer({ directory: '/work/api', args: ['run', '2:1', 'run the tests'] });
  const failed = (id: string, error = 'server_error') => answer({ directory: '/work/api', args: ['failed', id, '--error', error] });
  return { ...fake, answer, failed };
}

describe('a turn that ends on an API error', () => {
  it('sends a worker continue as main would, a minute later', async () => {
    const { failed, typed } = await worker();
    expect((await failed('2:1')).ok).toBe(true);
    minutes(1);
    expect(typed).toEqual(['2:1 continue']);
  });

  it('queues main continue, and tells it once the tries are spent', async () => {
    const { failed, told } = await worker();
    for (const wait of [1, 2, 5, 10]) {
      await failed('2:0');
      minutes(wait);
    }
    expect(told).toEqual(['2 continue', '2 continue', '2 continue', '2 continue']);
    await failed('2:0');
    expect(told[4]).toBe(`2 ${gaveUpText('main', '2:0', 'server_error', 4)}`);
  });

  it('sends nothing once the worker began a turn of its own first', async () => {
    const { answer, failed, typed } = await worker();
    await failed('2:1');
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    minutes(10);
    expect(typed).toEqual([]);
  });

  it('logs a continue the pane refused or failed to take', async () => {
    const fake = project();
    const logged: string[] = [];
    fake.ports.log = (id, message) => { logged.push(`${id} ${message}`); };
    const answer = sessionRequests(fake.ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    fake.ports.send = (id) => (id === '2:1' ? Promise.resolve({ refused: 'gone' }) : Promise.reject(new Error('no pty')));
    for (const id of ['2:1', '2:2']) await answer({ directory: '/work/api', args: ['failed', id, '--error', 'server_error'] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(logged).toContain('2:1 `continue` not sent: gone');
    expect(logged).toContain('2:2 `continue` not sent: no pty');
  });

  it('is refused for a pane that is not open', async () => {
    const { failed } = await worker();
    expect((await failed('2:7')).ok).toBe(false);
  });
});
