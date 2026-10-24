import { describe, expect, it } from 'vitest';
import {
  agentStartEntry, logFileNames, matchesLogFilter, needsRotation, paneExitEntry, parseLogLine,
  removalEntry, shipEntry, type LogEntry,
} from './log-entry';

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
  it('skips an empty line, a non-object, and an unknown level or kind', () => {
    expect(parseLogLine('')).toBeUndefined();
    expect(parseLogLine('42')).toBeUndefined();
    expect(parseLogLine('null')).toBeUndefined();
    expect(parseLogLine(JSON.stringify({ ...entry, level: 'debug' }))).toBeUndefined();
    expect(parseLogLine(JSON.stringify({ ...entry, kind: 'other' }))).toBeUndefined();
    expect(parseLogLine(JSON.stringify({ ...entry, project: 7 }))).toBeUndefined();
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
      level: 'info', kind: 'pane', project: '/work/shop', message: 'terminal 3 exited (code 0)',
    });
    expect(paneExitEntry('/work/shop', 2, 1, false).level).toBe('warn');
  });
  it('files an agent pane exit under agent', () => {
    expect(paneExitEntry('/work/shop', 0, 0, true)).toEqual({
      level: 'info', kind: 'agent', project: '/work/shop', message: 'agent in terminal 1 exited (code 0)',
    });
  });
  it('leaves the project out when the pane has none', () => {
    expect(paneExitEntry(undefined, 0, 0, false)).not.toHaveProperty('project');
  });
  it('says where an agent started', () => {
    expect(agentStartEntry('/work/shop', 1)).toEqual({
      level: 'info', kind: 'agent', project: '/work/shop', message: 'agent started in terminal 2',
    });
  });
  it('reads a ship as info, a failed one as an error', () => {
    const request = { projectPath: '/work/shop', cardId: 'c1', title: 'Fix login', slot: 1 };
    const worktreeEntry = { branch: 'fix-login' } as never;
    expect(shipEntry(request, { ok: true, entry: worktreeEntry })).toEqual({
      level: 'info', kind: 'ship', project: '/work/shop', message: '"Fix login" shipped on fix-login',
    });
    expect(shipEntry(request, { ok: false, message: 'no free pane' })).toEqual({
      level: 'error', kind: 'ship', project: '/work/shop', message: '"Fix login" not shipped: no free pane',
    });
    expect(shipEntry(request, { ok: false, message: '"Fix login" is on the manager\'s board' })).toEqual({
      level: 'error', kind: 'ship', project: '/work/shop', message: 'not shipped: "Fix login" is on the manager\'s board',
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
