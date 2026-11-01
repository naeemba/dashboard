import { describe, expect, it } from 'vitest';
import { LIVE_USE_STEP_MS, parseSessionIndex, renamed, resumeChoice, sessionPage, stillRunning, withLive, withSession, type SessionIndex } from './session-index';

const ID = 'ccaaf965-c864-48db-8044-30bf27d93087';
const OTHER = '4a8480d2-4e1d-4dca-8cac-f7a8e29548a3';
const PROJECT = '/work/dashboard';

function started(index: SessionIndex, id: string, at: number): SessionIndex {
  return withSession(index, PROJECT, 'dashboard', { id, directory: PROJECT, card: null, at });
}

describe('withSession', () => {
  it('labels each new conversation after the project, counting up', () => {
    const index = started(started({}, ID, 1), OTHER, 2);
    expect(index[PROJECT].map((row) => row.label)).toEqual(['dashboard-1', 'dashboard-2']);
  });

  // /resume picks an old conversation, and the main session reports it again.
  it('uses an id it already has again instead of adding a second row', () => {
    const index = started(started({}, ID, 1), ID, 5);
    expect(index[PROJECT]).toHaveLength(1);
    expect(index[PROJECT][0]).toMatchObject({ startedAt: 1, lastUsedAt: 5 });
  });
});

describe('parseSessionIndex', () => {
  it('drops a row whose id is not a UUID, since a resume types it into a shell', () => {
    const good = started({}, ID, 1)[PROJECT][0];
    const parsed = parseSessionIndex({ [PROJECT]: [good, { ...good, id: `${ID}; rm -rf ~` }], '/x': 'no' });
    expect(parsed).toEqual({ [PROJECT]: [good] });
  });

  it('reads anything that is not an object as empty', () => {
    expect(parseSessionIndex(null)).toEqual({});
    expect(parseSessionIndex([1])).toEqual({});
  });
});

describe('withLive', () => {
  it('marks a running session used once its last use is a step old, and hands the same index back otherwise', () => {
    const index = started({}, ID, 1);
    const later = 1 + LIVE_USE_STEP_MS;
    expect(withLive(index, [ID], later)[PROJECT][0].lastUsedAt).toBe(later);
    expect(withLive(index, [ID], later - 1)).toBe(index);
    expect(withLive(index, [OTHER], later)).toBe(index);
  });
});

describe('renamed', () => {
  it('trims the new name and refuses an empty one', () => {
    const index = started({}, ID, 1);
    const next = renamed(index, PROJECT, ID, '  drawer work ');
    expect(typeof next === 'string' ? next : next[PROJECT][0].label).toBe('drawer work');
    expect(renamed(index, PROJECT, ID, '   ')).toMatch(/needs a name/);
    expect(renamed(index, PROJECT, OTHER, 'x')).toMatch(/not in this project/);
  });
});

describe('sessionPage', () => {
  it('lists the most recently used first and says whether older ones are left', () => {
    const index = started(started(started({}, ID, 1), OTHER, 2), 'ffffffff-c864-48db-8044-30bf27d93087', 3);
    const page = sessionPage(index, PROJECT, 2);
    expect(page.rows.map((row) => row.label)).toEqual(['dashboard-3', 'dashboard-2']);
    expect(page.more).toBe(true);
    expect(sessionPage(index, PROJECT, 3).more).toBe(false);
    expect(sessionPage(index, '/elsewhere', 50)).toEqual({ rows: [], more: false });
  });
});

describe('resumeChoice', () => {
  const record = started({}, ID, 1)[PROJECT][0];
  const there = (): boolean => true;

  it('resumes a session that is not running and whose folder is there', () => {
    expect(resumeChoice(record, there, null)).toEqual({ record });
  });

  it('refuses one still running, one whose worktree is gone, and one it has no row for', () => {
    expect(resumeChoice(record, there, 'terminal 3')).toEqual({ refused: 'dashboard-1 is still running in terminal 3' });
    expect(resumeChoice(record, () => false, null)).toEqual({ refused: `dashboard-1 ran in ${PROJECT}, which is gone` });
    expect(resumeChoice(undefined, there, null)).toEqual({ refused: 'That session is not in this project any more' });
  });
});

describe('stillRunning', () => {
  it('names where a running conversation runs, by its label or without one, and passes one that is not', () => {
    expect(stillRunning('dashboard-1', 'terminal 3')).toBe('dashboard-1 is still running in terminal 3');
    expect(stillRunning(undefined, 'terminal 3')).toBe('That conversation is still running in terminal 3');
    expect(stillRunning('dashboard-1', null)).toBeNull();
  });
});
