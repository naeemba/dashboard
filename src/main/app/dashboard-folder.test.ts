import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dashboardPath } from './dashboard-folder';
import { MANAGER_PROJECT } from '../../shared/manager/manager';

describe('dashboardPath', () => {
  it('is in the project itself, so its .dashboard commits with the rest of the repository', () => {
    expect(dashboardPath('/work/api', 'notes.md')).toBe(join('/work/api', '.dashboard', 'notes.md'));
  });

  // Asked through MANAGER_PROJECT rather than a bare '' so the two cannot come apart: give the manager
  // a real path one day and this test says so, instead of the app quietly writing a .dashboard folder
  // into whatever directory it happened to be launched from.
  it('is in the home directory for the manager, whose page has no folder', () => {
    expect(dashboardPath(MANAGER_PROJECT.path)).toBe(join(homedir(), '.dashboard'));
  });
});
