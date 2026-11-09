import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { processesInstallSlices, SLICE_UNITS, systemdUserFolder } from './install-slices';

// A folder holding the files given, and a count of reloads.
function install(present: Record<string, string> = {}) {
  const files = new Map(Object.entries(present));
  let reloads = 0;
  const bound = bind(processesInstallSlices, {
    writeNew(file, text) {
      if (files.has(file)) return false;
      files.set(file, text);
      return true;
    },
    reload: async () => { reloads += 1; },
  });
  return { call: () => bound.call({ folder: '/units' }), files, reloads: () => reloads };
}

describe('processes.install-slices', () => {
  it('writes both slices into an empty folder and reloads once', async () => {
    const made = install();
    await expect(made.call()).resolves.toEqual({ output: 'installed agents.slice and panes.slice', written: ['agents.slice', 'panes.slice'] });
    expect(made.files.get('/units/agents.slice')).toBe(SLICE_UNITS['agents.slice']);
    expect(made.reloads()).toBe(1);
  });

  it('leaves a slice that is there as it is and writes the other', async () => {
    const made = install({ '/units/agents.slice': 'tuned by hand' });
    await expect(made.call()).resolves.toMatchObject({ written: ['panes.slice'] });
    expect(made.files.get('/units/agents.slice')).toBe('tuned by hand');
  });

  it('reloads nothing when both are there', async () => {
    const made = install({ '/units/agents.slice': '', '/units/panes.slice': '' });
    await expect(made.call()).resolves.toMatchObject({ written: [] });
    expect(made.reloads()).toBe(0);
  });

  it('caps the agents slice and leaves the panes slice uncapped', () => {
    expect(SLICE_UNITS['agents.slice']).toMatch(/CPUWeight=30\nMemoryHigh=16G\nMemoryMax=20G\nMemorySwapMax=6G/);
    expect(SLICE_UNITS['panes.slice']).not.toMatch(/Memory|CPU/);
  });
});

describe('systemdUserFolder', () => {
  it('is under XDG_CONFIG_HOME when it is set, and ~/.config when not', () => {
    expect(systemdUserFolder({ XDG_CONFIG_HOME: '/config' }, '/home/me')).toBe('/config/systemd/user');
    expect(systemdUserFolder({ XDG_CONFIG_HOME: '' }, '/home/me')).toBe('/home/me/.config/systemd/user');
    expect(systemdUserFolder({}, '/home/me')).toBe('/home/me/.config/systemd/user');
  });
});
