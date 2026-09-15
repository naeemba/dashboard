import { describe, expect, it } from 'vitest';
import { paneOfProcess, parentProcesses, sessionsByPane } from './pane-sessions';

// What `ps -eo pid=,ppid=` gives back on the machine this was written on, cut down: claude 3690 runs
// inside zsh 51152, which the app spawned for the pane, and the app is 51137.
const PS = `
 3690 51152
51152 51137
51137     1
84623 51153
51153 51137
  999   998
  998     1
`;

const PANES = new Map([[51152, '1:2'], [51153, '1:4']]);

describe('parentProcesses', () => {
  it('reads two columns of numbers and skips anything else', () => {
    const parents = parentProcesses(PS);
    expect(parents.get(3690)).toBe(51152);
    expect(parents.get(51137)).toBe(1);
    expect(parentProcesses('PID PPID\n  3 4\n')).toEqual(new Map([[3, 4]]));
  });
});

describe('paneOfProcess', () => {
  const parents = parentProcesses(PS);

  it('walks up to the shell the pane owns', () => {
    expect(paneOfProcess(parents, PANES, 3690)).toBe('1:2');
    expect(paneOfProcess(parents, PANES, 84623)).toBe('1:4');
  });

  it('answers with the pane when the process is the pane shell itself', () => {
    expect(paneOfProcess(parents, PANES, 51152)).toBe('1:2');
  });

  it('gives up on a claude started in some other terminal', () => {
    expect(paneOfProcess(parents, PANES, 999)).toBeUndefined();
  });

  it('gives up on a process the tree has never heard of', () => {
    expect(paneOfProcess(parents, PANES, 4242)).toBeUndefined();
  });

  it('stops rather than hangs on a tree that loops', () => {
    expect(paneOfProcess(new Map([[7, 8], [8, 7]]), PANES, 7)).toBeUndefined();
  });
});

describe('sessionsByPane', () => {
  it('places the live sessions and drops the ones with no pane', () => {
    expect(sessionsByPane(parentProcesses(PS), PANES, [
      { pid: 3690, session: 'a' },
      { pid: 999, session: 'elsewhere' },
      { pid: 84623, session: 'b' },
    ])).toEqual(new Map([['1:2', 'a'], ['1:4', 'b']]));
  });

  it('drops a session whose process has gone', () => {
    expect(sessionsByPane(parentProcesses(PS), PANES, [{ pid: 7777, session: 'dead' }])).toEqual(new Map());
  });
});
