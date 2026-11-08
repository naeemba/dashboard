import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import setup from './vitest.temporary-folder-guard';

// Runs the guard inside the real run's own folder: setup() points the variables at a new folder, and each
// case puts them back afterwards so the rest of this file's run is not moved.
const names = ['TMPDIR', 'TEMP', 'TMP'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(names.map((name) => [name, process.env[name]])); });
afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('temporary folder guard', () => {
  it('points every temporary variable at one new folder, fails naming a leak, and removes the folder anyway', () => {
    const teardown = setup();
    const folder = process.env.TMPDIR ?? '';
    expect(names.map((name) => process.env[name])).toEqual([folder, folder, folder]);
    expect(folder).not.toBe(saved.TMPDIR);
    const leak = mkdtempSync(join(tmpdir(), 'leak-'));
    expect(dirname(leak)).toBe(folder);
    expect(teardown).toThrow('leak- ×1');
    expect(existsSync(folder)).toBe(false);
  });

  it('tears down a clean folder without failing', () => {
    const teardown = setup();
    const folder = process.env.TMPDIR ?? '';
    expect(teardown).not.toThrow();
    expect(existsSync(folder)).toBe(false);
  });
});
