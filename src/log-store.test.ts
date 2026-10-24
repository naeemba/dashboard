import { appendFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './log-entry';
import { logStore } from './log-store';

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
    expect(messages.at(-1)).toBe('entry 19');
    expect(messages).toEqual([...messages].sort((one, other) => Number(one.split(' ')[1]) - Number(other.split(' ')[1])));
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
