import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { dashboardFolder } from './dashboard-folder';
import { MANAGER_PROJECT } from './manager';

describe('dashboardFolder', () => {
  it('is the project itself, so its .dashboard commits with the rest of the repository', () => {
    expect(dashboardFolder('/work/api')).toBe('/work/api');
  });

  // Asked through MANAGER_PROJECT rather than a bare '' so the two cannot come apart: give the manager
  // a real path one day and this test says so, instead of the app quietly writing a .dashboard folder
  // into whatever directory it happened to be launched from.
  it('is the home directory for the manager, whose page has no folder', () => {
    expect(dashboardFolder(MANAGER_PROJECT.path)).toBe(homedir());
  });
});
