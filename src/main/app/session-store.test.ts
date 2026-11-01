import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { channels } from './channels';
import { PROJECT_MODES } from '../../shared/keys/modes';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import { sessionStore } from './session-store';

const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })); });

const layout = { pages: [{ path: '/code/api', mode: PROJECT_MODES[0], focused: 0, names: [null] }], activeIndex: 0 };

function store() {
  const directory = mkdtempSync(path.join(tmpdir(), 'session-store-'));
  directories.push(directory);
  const file = path.join(directory, 'session.json');
  const table = channels();
  sessionStore(table, file, () => -1, () => false);
  return { table, file };
}

describe('session:write', () => {
  it("leaves the file alone for another screen's layout", () => {
    const { table, file } = store();
    table.dispatch('couch', 'session:write', [layout]);
    expect(existsSync(file)).toBe(false);
  });

  it("writes the host window's layout", () => {
    const { table, file } = store();
    table.dispatch(LOCAL_SCREEN, 'session:write', [layout]);
    expect(existsSync(file)).toBe(true);
  });
});

describe('session:read', () => {
  it("answers the host window's latest layout, which another screen's never replaces", async () => {
    const { table } = store();
    expect(await table.invoke(LOCAL_SCREEN, 'session:read', [])).toEqual({ pages: [], activeIndex: 0 });
    table.dispatch(LOCAL_SCREEN, 'session:write', [layout]);
    table.dispatch('couch', 'session:write', [{ pages: [], activeIndex: 0 }]);
    expect(await table.invoke(LOCAL_SCREEN, 'session:read', [])).toEqual(layout);
  });
});
