import { describe, expect, it } from 'vitest';
import {
  agentStartEntry, ipcFailureEntry, LOG_FILE_LIMIT_SHOWN, readLogDraft, logFileNames, matchesLogFilter, needsRotation, paneExitEntry, parseLogLine,
  removalEntry, shipEntry, type LogEntry,
} from './log-entry';
import { STACK_LIMIT } from './log-error';

const entry: LogEntry = {
  time: '2026-10-24T10:00:00.000Z', level: 'error', kind: 'card', project: '/work/shop', message: 'Board not saved: EACCES',
};

describe('parseLogLine', () => {
  it('reads a written entry back', () => {
    expect(parseLogLine(JSON.stringify(entry))).toEqual(entry);
  });
  it('reads an entry with no project', () => {
    const appWide: LogEntry = { ...entry };
    delete appWide.project;
    expect(parseLogLine(JSON.stringify(appWide))).toEqual(appWide);
  });
  it('skips a line cut off by a crash', () => {
    expect(parseLogLine(JSON.stringify(entry).slice(0, 30))).toBeUndefined();
  });
  it('skips an empty line, a non-object, and a field the row cannot show', () => {
    expect(parseLogLine('')).toBeUndefined();
    expect(parseLogLine('42')).toBeUndefined();
    expect(parseLogLine('null')).toBeUndefined();
    expect(parseLogLine(JSON.stringify({ ...entry, project: 7 }))).toBeUndefined();
    expect(parseLogLine(JSON.stringify({ ...entry, level: 3 }))).toBeUndefined();
  });
  it('keeps a level or kind a newer build wrote, as its text', () => {
    expect(parseLogLine(JSON.stringify({ ...entry, level: 'debug', kind: 'other' }))).toEqual({ ...entry, level: 'debug', kind: 'other' });
  });
  it('ignores a key it does not know, rather than the line', () => {
    expect(parseLogLine(JSON.stringify({ ...entry, mood: 'grim' }))).toEqual(entry);
  });
  it('reads the detail fields, and leaves off a wrong-typed one rather than the line', () => {
    const detailed: LogEntry = {
      ...entry, source: 'renderer', action: 'project.close', channel: 'projects:close', build: '1.0.0+abcdef123456',
      context: { slot: 1, pane: 2, card: 'c1', session: 's1' },
      error: { name: 'TypeError', message: 'boom', stack: 'TypeError: boom\n    at close', code: 'ENOENT', cause: { message: 'below' } },
    };
    expect(parseLogLine(JSON.stringify(detailed))).toEqual(detailed);
    expect(parseLogLine(JSON.stringify({ ...entry, channel: 7, context: { slot: 'one' } }))).toEqual(entry);
  });
});

describe('readLogDraft', () => {
  it('marks a draft with where it came from and drops a time or build it brought', () => {
    const sent = { level: 'error', kind: 'error', message: 'Board not saved', time: '1999', build: 'forged', source: 'main' };
    expect(readLogDraft(sent, 'renderer')).toEqual({ level: 'error', kind: 'error', message: 'Board not saved', source: 'renderer' });
  });
  it('refuses a level or kind this build does not write', () => {
    expect(readLogDraft({ level: 'debug', kind: 'error', message: 'x' }, 'renderer')).toBeUndefined();
    expect(readLogDraft('x', 'renderer')).toBeUndefined();
  });
  it('cuts a stack sent over the wire', () => {
    const draft = readLogDraft({ level: 'error', kind: 'error', message: 'x', error: { message: 'x', stack: 'a'.repeat(50_000) } }, 'renderer');
    expect(draft?.error?.stack?.length).toBe(STACK_LIMIT + 1);
  });
});

describe('ipcFailureEntry', () => {
  it('names the channel and the action, and carries the stack', () => {
    const thrown = new Error('An object could not be cloned');
    expect(ipcFailureEntry('project:close', thrown, 'project.close')).toEqual({
      level: 'error', kind: 'error', source: 'main', channel: 'project:close', action: 'project.close',
      message: 'project:close failed: An object could not be cloned',
      error: { name: 'Error', message: 'An object could not be cloned', stack: thrown.stack },
    });
    expect(ipcFailureEntry('log:read', new Error('x'), undefined).action).toBeUndefined();
  });
});

describe('logFileNames', () => {
  it('names the live file first and the oldest last', () => {
    expect(logFileNames('/data/dashboard.log', 5)).toEqual([
      '/data/dashboard.log', '/data/dashboard.log.1', '/data/dashboard.log.2', '/data/dashboard.log.3', '/data/dashboard.log.4',
    ]);
  });
});

describe('needsRotation', () => {
  it('rotates only when the append would pass the limit', () => {
    expect(needsRotation(90, 10, 100)).toBe(false);
    expect(needsRotation(91, 10, 100)).toBe(true);
  });
  it('never rotates an empty file, however big the entry', () => {
    expect(needsRotation(0, 500, 100)).toBe(false);
  });
});

describe('matchesLogFilter', () => {
  it('matches everything on an empty query', () => {
    expect(matchesLogFilter(entry, '')).toBe(true);
    expect(matchesLogFilter(entry, '   ')).toBe(true);
  });
  it('finds a word in the level, the kind, the project or the message, ignoring case', () => {
    expect(matchesLogFilter(entry, 'ERROR')).toBe(true);
    expect(matchesLogFilter(entry, 'card')).toBe(true);
    expect(matchesLogFilter(entry, 'shop')).toBe(true);
    expect(matchesLogFilter(entry, 'eacces')).toBe(true);
  });
  it('wants every word', () => {
    expect(matchesLogFilter(entry, 'error card')).toBe(true);
    expect(matchesLogFilter(entry, 'error ship')).toBe(false);
  });
});

describe('entry wording', () => {
  it('reads a clean pane exit as info and a failed one as a warning', () => {
    expect(paneExitEntry('/work/shop', 2, 0, false)).toEqual({
      level: 'info', kind: 'pane', project: '/work/shop', message: 'terminal 3 exited (code 0)', context: { pane: 2 },
    });
    expect(paneExitEntry('/work/shop', 2, 1, false).level).toBe('warn');
  });
  it('files an agent pane exit under agent', () => {
    expect(paneExitEntry('/work/shop', 1, 0, true)).toEqual({
      level: 'info', kind: 'agent', project: '/work/shop', message: 'agent in terminal 2 exited (code 0)', context: { pane: 1 },
    });
  });
  it('leaves the project out when the pane has none', () => {
    expect(paneExitEntry(undefined, 0, 0, false)).not.toHaveProperty('project');
  });
  it('says where an agent started', () => {
    expect(agentStartEntry('/work/shop', 1)).toEqual({
      level: 'info', kind: 'agent', project: '/work/shop', message: 'agent started in terminal 2', context: { pane: 1 },
    });
  });
  it('reads a ship as info, a failed one as an error', () => {
    const request = { projectPath: '/work/shop', cardId: 'c1', title: 'Fix login', slot: 1 };
    const worktreeEntry = { branch: 'fix-login' } as never;
    const context = { slot: 1, card: 'c1' };
    expect(shipEntry(request, { ok: true, entry: worktreeEntry })).toEqual({
      level: 'info', kind: 'ship', project: '/work/shop', message: '"Fix login" shipped on fix-login', context,
    });
    expect(shipEntry(request, { ok: false, message: 'no free pane' })).toEqual({
      level: 'error', kind: 'ship', project: '/work/shop', message: '"Fix login" not shipped: no free pane', context,
    });
    expect(shipEntry(request, { ok: false, message: '"Fix login" is on the manager\'s board' })).toEqual({
      level: 'error', kind: 'ship', project: '/work/shop', message: 'not shipped: "Fix login" is on the manager\'s board', context,
    });
  });
  it('reads a removal as info, a refused one as a warning', () => {
    expect(removalEntry('/work/shop', '/work/shop-fix', { ok: true, message: '', dirty: [] })).toEqual({
      level: 'info', kind: 'worktree', project: '/work/shop', message: 'removed /work/shop-fix',
    });
    expect(removalEntry('/work/shop', '/work/shop-fix', { ok: false, message: 'has changes', dirty: ['a.ts'] })).toEqual({
      level: 'warn', kind: 'worktree', project: '/work/shop', message: 'not removed /work/shop-fix: has changes',
    });
  });
});

describe('LOG_FILE_LIMIT_SHOWN', () => {
  it('says the limit the store enforces', () => expect(LOG_FILE_LIMIT_SHOWN).toBe('5 MB'));
});
