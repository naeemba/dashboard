import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGER_FOLDER, projectInSlot, sessionSlot } from './manager-terminals';
import { MANAGER_SLOT } from '../../shared/manager/manager';

const same = (folder: string): string => folder;

describe('MANAGER_FOLDER', () => {
  it('is the .dashboard folder in the home directory, where projects.yaml is', () => {
    expect(MANAGER_FOLDER).toBe(path.join(homedir(), '.dashboard'));
  });
});

describe('projectInSlot', () => {
  const api = { name: 'api', path: '/work/api', missing: false };

  it('gives a project its own slot and the manager its folder', () => {
    expect(projectInSlot([api], 0)).toBe(api);
    expect(projectInSlot([api], MANAGER_SLOT)?.path).toBe(MANAGER_FOLDER);
    expect(projectInSlot([api], 3)).toBeUndefined();
  });
});

describe('sessionSlot', () => {
  it('keeps the project a folder was found in', () => {
    expect(sessionSlot(2, '/work/api', same)).toBe(2);
  });

  it('is the manager for its folder and anything under it', () => {
    expect(sessionSlot(-1, MANAGER_FOLDER, same)).toBe(MANAGER_SLOT);
    expect(sessionSlot(-1, path.join(MANAGER_FOLDER, 'notes'), same)).toBe(MANAGER_SLOT);
  });

  // A sibling sharing the prefix is not inside it.
  it('is no slot for a folder outside every project and the manager', () => {
    expect(sessionSlot(-1, '/tmp', same)).toBe(-1);
    expect(sessionSlot(-1, `${MANAGER_FOLDER}-old`, same)).toBe(-1);
  });
});
