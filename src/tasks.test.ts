import { describe, expect, it } from 'vitest';
import { lastPrintableLine, printableLines, taskSummary, type TaskResult } from './tasks';

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
