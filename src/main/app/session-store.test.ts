import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { channels } from './channels';
import { PROJECT_MODES } from '../../shared/keys/modes';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import { sessionStore } from './session-store';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { temporaryFolder } from '../testing/temporary-folder';

const layout = { pages: [{ path: '/code/api', mode: PROJECT_MODES[0], focused: 0, names: [null] }], activeIndex: 0 };

function store() {
  const directory = temporaryFolder('session-store-');
  const file = path.join(directory, 'session.json');
  const table = channels();
  const sessions = sessionStore(table, file, (projectPath) => (projectPath === '/code/api' ? 2 : -1), () => undefined);
  return { table, file, sessions };
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

describe('hasKeyboard', () => {
  it("is the pane each page of every screen's layout has the keyboard on, and none before a layout", () => {
    const { table, sessions } = store();
    expect(sessions.hasKeyboard('2:3')).toBe(false);
    table.dispatch(LOCAL_SCREEN, 'session:write', [{ ...layout, pages: [{ ...layout.pages[0], focused: 3 }] }]);
    expect(sessions.hasKeyboard('2:3')).toBe(true);
    expect(sessions.hasKeyboard('2:1')).toBe(false);
    table.dispatch('couch', 'session:write', [{ ...layout, pages: [{ ...layout.pages[0], focused: 1 }] }]);
    expect(sessions.hasKeyboard('2:1')).toBe(true);
    expect(sessions.hasKeyboard('2:3')).toBe(true);
  });

  it('is every manager pane, which no layout names', () => {
    const { sessions } = store();
    expect(sessions.hasKeyboard(`${MANAGER_SLOT}:2`)).toBe(true);
  });
});
