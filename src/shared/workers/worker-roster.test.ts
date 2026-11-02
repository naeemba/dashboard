import { describe, expect, it } from 'vitest';
import { workerAbout, workerCount, workerRows, workerStatus, type DispatchedWorker, type WorkerStatus } from './worker-roster';
import { paneLink, paneLinks } from './pane-link';

const worker = (id: string, status: WorkerStatus): DispatchedWorker => ({ id, dispatcher: 2, project: 'api', name: `api-${id}`, about: 'go', status });

describe('worker roster', () => {
  it('counts workers by state, what still runs first, leaving out states nobody is in', () => {
    expect(workerCount([])).toBe('');
    expect(workerCount([worker('2:1', 'done')])).toBe('1 worker: 1 done');
    expect(workerCount([worker('2:1', 'done'), worker('2:2', 'working'), worker('2:3', 'working')])).toBe('3 workers: 2 working, 1 done');
  });

  it('lists rows by state, keeping the order they came in within each', () => {
    const workers = [worker('2:1', 'idle'), worker('2:2', 'done'), worker('2:3', 'blocked'), worker('2:4', 'done')];
    expect(workerRows(workers, '').map((row) => row.choice)).toEqual(['2:3', '2:2', '2:4', '2:1']);
    expect(workerRows(workers, '')[0]).toEqual({ name: 'api · terminal 4', detail: 'blocked · go', choice: '2:3' });
    expect(workerRows(workers, 'api-2:4').map((row) => row.choice)).toEqual(['2:4']);
  });

  it('says idle once the agent is gone, whatever its hooks last said', () => {
    expect(workerStatus(false, 'done')).toBe('idle');
    expect(workerStatus(true, undefined)).toBe('working');
    expect(workerStatus(true, 'running')).toBe('working');
    expect(workerStatus(true, 'blocked')).toBe('blocked');
  });

  it('keeps the first words of the prompt', () => {
    expect(workerAbout('  fix the\nflaky test  ')).toBe('fix the flaky test');
    expect(workerAbout('one two three four five six seven eight nine')).toBe('one two three four five six seven eight…');
  });
});

describe('pane links', () => {
  it('finds every pane address, the manager\'s negative slot included, and nothing bare', () => {
    const text = `started api-terminal-2 in 2:1 ${paneLink('2:1')}, then ${paneLink('-2:3')}.`;
    expect(paneLinks(text).map((link) => [text.slice(link.start, link.end), link.id])).toEqual([
      ['dashboard://pane/2:1', '2:1'],
      ['dashboard://pane/-2:3', '-2:3'],
    ]);
    expect(paneLinks('meet at 2:1')).toEqual([]);
  });
});
