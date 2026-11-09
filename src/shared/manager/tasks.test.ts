import { describe, expect, it } from 'vitest';
import {
  anyRunning, commandKeys, COMMAND_KEY, finishedTasks, hasTail, idleTask, lastPrintableLine,
  printableLines, taskSummary, type TaskResult,
} from './tasks';

function result(fields: Partial<TaskResult>): TaskResult {
  return { projectPath: '/p', state: 'done', exitCode: 0, lastLine: '', tail: [], ...fields };
}

describe('printableLines', () => {
  it('resolves a redrawn line to what it finally said', () => {
    expect(printableLines('one\nbuilding 10%\rdone\n')).toEqual(['one', 'done', '']);
  });

  it('strips the colours a tool writes round its own words', () => {
    expect(printableLines('\u001B[31mfailed\u001B[0m')).toEqual(['failed']);
  });
});

describe('lastPrintableLine', () => {
  it('takes the last line with anything in it', () => {
    expect(lastPrintableLine('one\ntwo\n\n  \n')).toBe('two');
  });

  it('strips the colours a tool writes round its own words', () => {
    expect(lastPrintableLine('\u001B[31mfound 3 vulnerabilities\u001B[0m\n'))
      .toBe('found 3 vulnerabilities');
  });

  it('takes what a redrawn line finally said, not the first draft', () => {
    expect(lastPrintableLine('building 10%\rbuilding 90%\rdone\n')).toBe('done');
  });

  it('answers nothing for a command that printed nothing', () => {
    expect(lastPrintableLine('')).toBe('');
    expect(lastPrintableLine('\n\n')).toBe('');
  });
});

describe('taskSummary', () => {
  it('says nothing has been run yet', () => {
    expect(taskSummary(result({ state: 'idle', exitCode: null }))).toBe('—');
  });

  it('says a run is going', () => {
    expect(taskSummary(result({ state: 'running', exitCode: null }))).toBe('running');
  });

  it('says a run was stopped', () => {
    expect(taskSummary(result({ state: 'cancelled', exitCode: null }))).toBe('cancelled');
  });

  it('puts the exit code in front of what the command last said', () => {
    expect(taskSummary(result({ exitCode: 1, lastLine: '3 high, 0 moderate' })))
      .toBe('exit 1 · 3 high, 0 moderate');
  });

  it('is the exit code alone when the command printed nothing', () => {
    expect(taskSummary(result({ exitCode: 0, lastLine: '' }))).toBe('exit 0');
  });
});

describe('commandKeys', () => {
  it('puts the command box in front of one key per project', () => {
    expect(commandKeys([{ path: '/one' }, { path: '/two' }])).toEqual([COMMAND_KEY, '/one', '/two']);
  });

  it('is the command box alone when no project is open', () => {
    expect(commandKeys([])).toEqual([COMMAND_KEY]);
  });
});

describe('idleTask', () => {
  it('is a project nothing has been run in yet', () => {
    expect(taskSummary(idleTask('/one'))).toBe('—');
    expect(hasTail(idleTask('/one'))).toBe(false);
  });
});

describe('hasTail', () => {
  it('says a finished row has something to open', () => {
    expect(hasTail(result({ tail: ['done'] }))).toBe(true);
  });

  it('says a row that printed nothing has not', () => {
    expect(hasTail(result({ tail: [] }))).toBe(false);
  });
});

describe('anyRunning', () => {
  it('is going while one project is still going', () => {
    expect(anyRunning([result({ state: 'done' }), result({ state: 'running' })])).toBe(true);
  });

  it('is over once a cancel has answered every project', () => {
    expect(anyRunning([result({ state: 'cancelled' }), result({ state: 'cancelled' })])).toBe(false);
  });

  it('is over before anything has been run', () => {
    expect(anyRunning([])).toBe(false);
  });
});

describe('finishedTasks', () => {
  const one = { child: 'one', projectPath: '/one' };
  const two = { child: 'two', projectPath: '/two' };

  it('reports a process from the current run and drops it from the list', () => {
    expect(finishedTasks([one, two], 'one', 3, 3)).toEqual({ tasks: [two], send: true });
  });

  it('says nothing for a process a newer run already killed', () => {
    // Otherwise Escape and then Enter leaves rows the new run has just marked `running` showing
    // `cancelled`, reported by the run that is over.
    expect(finishedTasks([one, two], 'one', 2, 3)).toEqual({ tasks: [one, two], send: false });
  });

  it('says nothing a second time for a process already answered for', () => {
    // A spawn that fails fires `error` and then `close`; the second would overwrite the message.
    expect(finishedTasks([two], 'one', 3, 3)).toEqual({ tasks: [two], send: false });
  });
});
