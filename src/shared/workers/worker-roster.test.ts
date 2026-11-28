import { describe, expect, it } from 'vitest';
import { pausedAtWork, queuedRows, waitingText, workerAbout, workerCount, workerRows, workerStatus, workersHeading, withdrawTarget, type DispatchedWorker, type WorkerStatus } from './worker-roster';
import { paneLink, splitAtPaneLinks } from './pane-link';
import { PAUSE_CEILING_MS } from './done-report';

const worker = (id: string, status: WorkerStatus): DispatchedWorker => ({ id, dispatcher: 2, project: 'api', name: `api-${id}`, about: 'go', status });

describe('worker roster', () => {
  it('counts a pause on its own work as at work until the pause ceiling, and nothing else', () => {
    const waiting = { background: 1, scheduled: 0 };
    expect(pausedAtWork(waiting, 1000, 1000 + PAUSE_CEILING_MS - 1)).toBe(true);
    expect(pausedAtWork(waiting, 1000, 1000 + PAUSE_CEILING_MS)).toBe(false);
    expect(pausedAtWork({ background: 0, scheduled: 0 }, 1000, 1000)).toBe(false);
    expect(pausedAtWork(undefined, 1000, 1000)).toBe(false);
  });

  it('counts workers by state, what still runs first, leaving out states nobody is in', () => {
    expect(workerCount([])).toBe('');
    expect(workerCount([worker('2:1', 'done')])).toBe('1 worker: 1 done');
    expect(workerCount([worker('2:1', 'done'), worker('2:2', 'working'), worker('2:3', 'working')])).toBe('3 workers: 2 working, 1 done');
    expect(workerCount([worker('2:1', 'done')], 2)).toBe('1 worker: 1 done · 2 queued');
    expect(workerCount([], 1)).toBe('1 queued');
  });

  it('lists rows by state, keeping the order they came in within each', () => {
    const workers = [worker('2:1', 'idle'), worker('2:2', 'done'), worker('2:3', 'blocked'), worker('2:4', 'done')];
    expect(workerRows(workers, {}, 0).map((row) => row.choice)).toEqual(['2:3', '2:2', '2:4', '2:1']);
    expect(workerRows(workers, {}, 0)[0]).toEqual({ name: 'api · terminal 4', detail: 'blocked · go', choice: '2:3' });
  });

  it("says whether a worker's prompt cache is warm, and nothing for one that has not used it", () => {
    const workers = [worker('2:1', 'working'), worker('2:2', 'working'), worker('2:3', 'working')];
    const caches = { '2:1': { at: 0, tier: '1h' as const }, '2:2': { at: 0, tier: '5m' as const } };
    expect(workerRows(workers, caches, 18 * 60_000).map((row) => row.detail)).toEqual(['working · warm 42m · go', 'working · cold · go', 'working · go']);
  });

  it('says idle once the agent is gone, whatever its hooks last said', () => {
    expect(workerStatus(false, 'done')).toBe('idle');
    expect(workerStatus(true, undefined)).toBe('working');
    expect(workerStatus(true, 'running')).toBe('working');
    expect(workerStatus(true, 'blocked')).toBe('blocked');
    expect(workerStatus(true, 'done', true)).toBe('paused');
    expect(workerStatus(false, 'done', true)).toBe('idle');
  });

  it('lists a stalled worker after working and before a pause, saying how long it has been silent', () => {
    const stalled = { ...worker('2:1', 'stalled'), detail: 'stalled, silent 25 minutes' };
    expect(workerRows([worker('2:2', 'paused'), stalled, worker('2:3', 'working')], {}, 0).map((row) => row.detail))
      .toEqual(['working · go', 'stalled, silent 25 minutes · go', 'paused · go']);
    expect(workerCount([stalled, worker('2:3', 'working')])).toBe('2 workers: 1 working, 1 stalled');
  });

  it('says what a paused worker waits on, in place of its state', () => {
    expect(waitingText({ background: 2, scheduled: 0 })).toBe('waiting on 2 background tasks');
    expect(waitingText({ background: 1, scheduled: 1 })).toBe('waiting on 1 background task and 1 wakeup');
    const paused = { ...worker('2:1', 'paused'), detail: waitingText({ background: 0, scheduled: 2 }) };
    expect(workerRows([worker('2:2', 'done'), paused], {}, 0).map((row) => row.detail)).toEqual(['waiting on 2 wakeups · go', 'done · go']);
  });

  it('keeps the first words of the prompt', () => {
    expect(workerAbout('  fix the\nflaky test  ')).toBe('fix the flaky test');
    expect(workerAbout('one two three four five six seven eight nine')).toBe('one two three four five six seven eight…');
  });
});

describe('pane links', () => {
  it('cuts the text at every pane address, the manager\'s negative slot included, and at nothing bare', () => {
    const text = `started api-terminal-2 in 2:1 ${paneLink('2:1')}, then ${paneLink('-2:3')}.`;
    expect(splitAtPaneLinks(text)).toEqual(['started api-terminal-2 in 2:1 ', '2:1', ', then ', '-2:3', '.']);
    expect(splitAtPaneLinks('meet at 2:1')).toEqual(['meet at 2:1']);
  });

  it('lists queued starts by their place in the whole queue, naming an --after card', () => {
    const queued = [
      { id: 'q3', dispatcher: 2, project: 'api', place: '2nd', about: 'run fix the login', after: null },
      { id: 'q5', dispatcher: 2, project: 'crm', place: '4th', about: 'review a', after: 'b' },
    ];
    expect(queuedRows(queued)).toEqual([
      { key: 'q3', name: 'api · q3', detail: '2nd in line · run fix the login' },
      { key: 'q5', name: 'crm · q5', detail: '4th in line · after b · review a' },
    ]);
  });

  it('heads the popup with only the keys its rows answer', () => {
    expect(workersHeading([], 0, 'd')).toBe('No worker is open');
    expect(workersHeading([], 1, 'd')).toBe('1 queued · d withdraws a queued one');
    expect(workersHeading([worker('2:1', 'done')], 0, 'd')).toBe('1 worker: 1 done · Enter goes to one');
    expect(workersHeading([worker('2:1', 'done')], 2, 'd')).toBe('1 worker: 1 done · 2 queued · Enter goes to one · d withdraws a queued one');
    expect(workersHeading([], 1, null)).toBe('1 queued');
  });

  it('withdraws only a queued row, and says why for any other', () => {
    const queued = [{ id: 'q3', dispatcher: 2, project: 'api', place: '1st', about: 'run a', after: null }];
    const refused = { refused: 'Only a queued start is withdrawn; a running worker is released with pane release.' };
    expect(withdrawTarget(queued, queuedRows(queued)[0]?.key)).toEqual({ id: 'q3' });
    expect(withdrawTarget(queued, '2:1')).toEqual(refused);
    expect(withdrawTarget(queued, undefined)).toEqual(refused);
  });
});
