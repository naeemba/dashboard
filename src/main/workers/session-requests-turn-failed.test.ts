import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { gaveUpText } from './turn-failures';
import { workerSessionName } from './dispatch';

// turn-failures.test.ts holds the schedule; this is where its `continue` goes, and who is told.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const minutes = (count: number) => vi.advanceTimersByTime(count * 60_000);

const failure = (id: string, error = 'server_error', paneProject = '/work/api') => ({
  directory: '/work/api', args: ['failed', id, '--project', paneProject, '--error', error],
});

// `prompted` is what went in bare, handing the pane to no main; `typed` what went through pane.send.
async function worker(run = true) {
  const fake = project();
  const answer = sessionRequests(fake.ports);
  await answer({ directory: '/work/api', args: ['claim'] });
  if (run) await answer({ directory: '/work/api', args: ['run', '2:1', 'run the tests'] });
  const failed = (id: string, error?: string) => answer(failure(id, error));
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
    fake.agents.add('2:1').add('2:2');
    fake.workers.set('2:1', '/work/api').set('2:2', '/work/api');
    for (const id of ['2:1', '2:2']) await answer(failure(id));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(logged).toContain('2:1 `continue` not sent: gone');
    expect(logged).toContain('2:2 `continue` not sent: no pty');
  });

  it('sends a screen opened by hand the bare text, leaving it no main\'s worker', async () => {
    const { agents, workers, failed, prompted, typed } = await worker(false);
    agents.add('2:1');
    await failed('2:1');
    minutes(1);
    expect(prompted).toEqual(['2:1 continue']);
    expect(typed).toEqual([]);
    expect(workers.get('2:1')).toBeUndefined();
  });

  it('sends the bare text to a main\'s worker on a turn you typed', async () => {
    const { answer, failed, prompted, typed } = await worker();
    answer.notify('2:1', 'running', undefined, { promptSource: 'sdk', handed: true });
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    await failed('2:1');
    minutes(1);
    expect(prompted).toEqual(['2:1 continue']);
    expect(typed).toEqual([]);
  });

  it('sends nothing to a worker on the app\'s own question, whose report stays its own', async () => {
    const { answer, failed, prompted, typed } = await worker();
    answer.notify('2:1', 'done', undefined, { lastMessage: 'Tests pass.' });
    answer.notify('2:1', 'running', undefined, { promptSource: 'sdk', appAsks: true });
    await failed('2:1');
    minutes(1);
    expect(prompted).toEqual([]);
    expect(typed).toEqual([]);
    expect((await answer({ directory: '/work/api', args: ['report', '2:1'] })).output).toContain('Tests pass.');
  });

  it('resumes the pane a kept shell\'s old id names in this run', async () => {
    const { answer, typed } = await worker();
    await answer(failure('5:1'));
    minutes(1);
    expect(typed).toEqual(['2:1 continue']);
    expect((await answer(failure('2:1', 'server_error', '/work/gone'))).ok).toBe(false);
  });

  it('tells the worker\'s main once its tries are spent', async () => {
    const { failed, told } = await worker();
    for (const wait of [1, 2, 5, 10]) {
      await failed('2:1');
      minutes(wait);
    }
    await failed('2:1');
    expect(told).toEqual([`2 ${gaveUpText(workerSessionName('/work/api', 1), '2:1', 'server_error', 4)}`]);
  });

  it('stays given up on main, whose notice failing too starts no tries over', async () => {
    const { failed, told } = await worker();
    for (const wait of [1, 2, 5, 10]) {
      await failed('2:0');
      minutes(wait);
    }
    await failed('2:0');
    await failed('2:0');
    minutes(10);
    expect(told).toHaveLength(5);
  });

  it('calls main\'s continue off once main begins a turn', async () => {
    const { answer, failed, told } = await worker();
    await failed('2:0');
    answer.mainTurn(2, true);
    minutes(10);
    expect(told).toEqual([]);
  });

  it('is refused for a pane that is not open', async () => {
    const { failed } = await worker();
    expect((await failed('2:7')).ok).toBe(false);
  });
});
