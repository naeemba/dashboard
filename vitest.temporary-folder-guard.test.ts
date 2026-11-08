import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import setup from './vitest.temporary-folder-guard';

// Runs the guard for real: setup() points the variables at a new folder (inside the run's own folder, or in
// /tmp on a mac, where the run guard does not see it). Each case puts the variables back and removes that
// folder afterwards, whether its assertions passed or not.
const names = ['TMPDIR', 'TEMP', 'TMP'] as const;
let saved: Record<string, string | undefined> = {};
let folder = '';
beforeEach(() => { saved = Object.fromEntries(names.map((name) => [name, process.env[name]])); });
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = '';
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('temporary folder guard', () => {
  it('points every temporary variable at one new folder, fails naming a leak, and removes the folder anyway', () => {
    const teardown = setup();
    folder = process.env.TMPDIR ?? '';
    expect(names.map((name) => process.env[name])).toEqual([folder, folder, folder]);
    expect(folder).not.toBe(saved.TMPDIR);
    const leak = mkdtempSync(join(tmpdir(), 'leak-'));
    expect(dirname(leak)).toBe(folder);
    expect(teardown).toThrow('leak- ×1');
    expect(existsSync(folder)).toBe(false);
  });

  it('tears down a clean folder without failing', () => {
    const teardown = setup();
    folder = process.env.TMPDIR ?? '';
    expect(teardown).not.toThrow();
    expect(existsSync(folder)).toBe(false);
  });
});
