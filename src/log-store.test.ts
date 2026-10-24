import { appendFileSync, chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './log-entry';
import { logStore } from './log-store';

// Lets one test make a rename fail the way a busy or locked file does; every other test renames for real.
const renames = vi.hoisted(() => ({ failure: undefined as Error | undefined }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (renames.failure) throw renames.failure;
      return actual.renameSync(from, to);
    },
  };
});

let directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), 'log-store-')); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

const info = (message: string) => ({ level: 'info', kind: 'app', message }) as const;

describe('logStore', () => {
  it('stamps, writes and announces each entry', () => {
    const announced: LogEntry[] = [];
    const store = logStore(directory, (entry) => announced.push(entry));
    store.log(info('started'));
    expect(announced).toHaveLength(1);
    expect(announced[0].message).toBe('started');
    expect(Number.isNaN(Date.parse(announced[0].time))).toBe(false);
    expect(store.tail(10)).toEqual(announced);
  });

  it('rotates past the limit and never keeps more than five files', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 60; index++) store.log(info(`entry ${index}`));
    const live = path.join(directory, 'dashboard.log');
    expect(existsSync(`${live}.4`)).toBe(true);
    expect(existsSync(`${live}.5`)).toBe(false);
    for (const file of [live, `${live}.1`, `${live}.2`, `${live}.3`, `${live}.4`]) {
      expect(statSync(file).size).toBeLessThanOrEqual(200);
    }
    expect(store.tail(1)[0].message).toBe('entry 59');
  });

  it('writes one entry bigger than the limit without rotating away the files before it', () => {
    const store = logStore(directory, () => undefined, 200);
    store.log(info('x'.repeat(500)));
    expect(existsSync(path.join(directory, 'dashboard.log.1'))).toBe(false);
    expect(store.tail(1)[0].message).toHaveLength(500);
  });

  it('reads oldest first across files, and skips a half-written line', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 6; index++) store.log(info(`entry ${index}`));
    appendFileSync(path.join(directory, 'dashboard.log'), '{"time":"2026');
    expect(store.tail(1000).map((entry) => entry.message)).toEqual(
      ['entry 0', 'entry 1', 'entry 2', 'entry 3', 'entry 4', 'entry 5'],
    );
    expect(store.tail(2).map((entry) => entry.message)).toEqual(['entry 4', 'entry 5']);
  });

  it('reads past a rotated file that has gone missing', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 20; index++) store.log(info(`entry ${index}`));
    rmSync(path.join(directory, 'dashboard.log.1'));
    const messages = store.tail(1000).map((entry) => entry.message);
    const numbers = messages.map((message) => Number(message.split(' ')[1]));
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.at(-1)).toBe('entry 19');
    expect(numbers.every((number, index) => index === 0 || number > numbers[index - 1])).toBe(true);
  });

  it('keeps rotating past a missing middle file without throwing or growing past five files', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 10; index++) store.log(info(`entry ${index}`));
    rmSync(path.join(directory, 'dashboard.log.2'));
    expect(() => {
      for (let index = 10; index < 60; index++) store.log(info(`entry ${index}`));
    }).not.toThrow();
    const live = path.join(directory, 'dashboard.log');
    for (const file of [live, `${live}.1`, `${live}.2`, `${live}.3`, `${live}.4`]) {
      expect(statSync(file).size).toBeLessThanOrEqual(200);
    }
    expect(existsSync(`${live}.5`)).toBe(false);
    expect(store.tail(1)[0].message).toBe('entry 59');
  });

  it('keeps the files and drops the entry when a rotation cannot move them', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 20; index++) store.log(info(`entry ${index}`));
    const before = store.tail(1000).map((entry) => entry.message);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    chmodSync(directory, 0o555);
    try {
      expect(() => store.log(info(`x${'y'.repeat(400)}`))).not.toThrow();
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(existsSync(path.join(directory, 'dashboard.log.4'))).toBe(true);
      expect(store.tail(1000).map((entry) => entry.message)).toEqual(before);
    } finally {
      chmodSync(directory, 0o755);
      consoleError.mockRestore();
    }
  });

  it('drops the entry, and stops rotating, when a rotated file cannot be moved', () => {
    const store = logStore(directory, () => undefined, 200);
    for (let index = 0; index < 20; index++) store.log(info(`entry ${index}`));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renames.failure = Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    try {
      expect(() => store.log(info(`x${'y'.repeat(400)}`))).not.toThrow();
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      renames.failure = undefined;
      consoleError.mockRestore();
    }
  });

  it('starts a fresh line after a half-written line left by a crash', () => {
    appendFileSync(path.join(directory, 'dashboard.log'), '{"time":"2026');
    const store = logStore(directory, () => undefined);
    store.log(info('started'));
    expect(store.tail(10).at(-1)?.message).toBe('started');
    store.log(info('next'));
    expect(store.tail(10).map((entry) => entry.message)).toEqual(['started', 'next']);
  });

  it('reads a live file with more lines than one call can spread', () => {
    const line = JSON.stringify({ time: '2026-01-01T00:00:00.000Z', level: 'info', kind: 'app', message: 'm' });
    writeFileSync(path.join(directory, 'dashboard.log'), `${Array(200_000).fill(line).join('\n')}\n`);
    const store = logStore(directory, () => undefined);
    expect(store.tail(200_000)).toHaveLength(200_000);
  });

  it('returns nothing for a count of zero', () => {
    const store = logStore(directory, () => undefined);
    store.log(info('one'));
    expect(store.tail(0)).toEqual([]);
  });

  it('drops an entry it cannot write rather than throwing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const store = logStore(path.join(directory, 'missing', 'folder'), () => { throw new Error('not announced'); });
      expect(() => store.log(info('lost'))).not.toThrow();
      expect(store.tail(10)).toEqual([]);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
