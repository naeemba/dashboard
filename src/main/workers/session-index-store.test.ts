import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_USE_STEP_MS } from './session-index';
import { sessionIndexStore } from './session-index-store';

const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })); });

function temporaryFile(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'session-index-'));
  directories.push(directory);
  return path.join(directory, 'session-index.json');
}

const project = '/code/api';
const placement = (byPane: [string, string][], takenAt: number) => ({
  byPane: new Map(byPane.map(([pane, session]) => [pane, { session, directory: project }])),
  takenAt,
});

describe('sessionIndexStore', () => {
  it('records a launch before handing out its id, and reads it back from disk', () => {
    const file = temporaryFile();
    const id = sessionIndexStore(file).launched(project, '/code/api.worktrees/card', 'card-1');
    expect(sessionIndexStore(file).find(project, id)).toMatchObject({ id, directory: '/code/api.worktrees/card', card: 'card-1' });
  });

  it('names the pane a session runs in, and forgets it once a sweep no longer finds it', () => {
    const store = sessionIndexStore(temporaryFile());
    const id = store.launched(project, project, null);
    store.placed(placement([['0:3', id]], Date.now()));
    expect(store.runningIn(id)).toBe('terminal 4');
    store.placed(placement([], Date.now()));
    expect(store.runningIn(id)).toBeNull();
  });

  it('names the Claude screen before a pane, and drops it when main reports no conversation', () => {
    const store = sessionIndexStore(temporaryFile());
    const id = randomUUID();
    store.mainIs(project, id);
    store.placed(placement([['0:3', id]], Date.now()));
    expect(store.runningIn(id)).toBe('the Claude screen');
    store.mainIs(project, undefined);
    expect(store.runningIn(id)).toBe('terminal 4');
  });

  it("records main's conversation as a row of the project", () => {
    const store = sessionIndexStore(temporaryFile());
    const id = randomUUID();
    store.mainIs(project, id);
    expect(store.find(project, id)).toMatchObject({ id, directory: project, card: null });
  });

  it('skips the write when a sweep moves no row', () => {
    const file = temporaryFile();
    const store = sessionIndexStore(file);
    const id = store.launched(project, project, null);
    rmSync(file);
    store.placed(placement([['0:3', id]], Date.now() + LIVE_USE_STEP_MS - 1000));
    expect(existsSync(file)).toBe(false);
    store.placed(placement([['0:3', id]], Date.now() + LIVE_USE_STEP_MS + 1000));
    expect(existsSync(file)).toBe(true);
  });
});
