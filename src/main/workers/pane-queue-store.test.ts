import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import type { QueueEntry } from './pane-pool';
import { parseQueue, poolPorts, readQueue, writeQueue } from './pane-queue-store';
import { defaultSettings } from '../../shared/settings/settings';

const run: QueueEntry = {
  id: 'q3', dispatcherPath: '/work/api', projectPath: '/work/crm', cardId: null, after: 'b', queuedAt: '2026-11-26T12:00:00.000Z',
  work: { kind: 'run', project: 'crm', prompt: 'fix it', card: null, worktree: true, folder: null, as: 'terminal' },
};
const ship: QueueEntry = { ...run, id: 'q4', cardId: 'a', after: null, work: { kind: 'ship', title: 'A' } };

describe('the pane queue file', () => {
  it('reads back what it wrote, in order', () => {
    const file = path.join(temporaryFolder('dashboard-queue-'), 'pane-queue.json');
    writeQueue(file, { next: 5, entries: [run, ship] });
    expect(readQueue(file)).toEqual({ next: 5, entries: [run, ship] });
  });

  it('is an empty queue with no file or one that does not parse', () => {
    const folder = temporaryFolder('dashboard-queue-');
    expect(readQueue(path.join(folder, 'none.json'))).toEqual({ next: 1, entries: [] });
    writeFileSync(path.join(folder, 'broken.json'), '{');
    expect(readQueue(path.join(folder, 'broken.json'))).toEqual({ next: 1, entries: [] });
  });

  it('leaves out an entry that does not read and keeps the rest', () => {
    const broken = [{ ...run, id: '' }, { ...ship, work: { kind: 'ship' } }, { ...run, work: { ...run.work, as: 'window' } }, 'q9'];
    expect(parseQueue({ next: 0, entries: [...broken, ship, { ...ship, id: 'q5', work: { kind: 'review' } }] }))
      .toEqual({ next: 1, entries: [ship, { ...ship, id: 'q5', work: { kind: 'review' } }] });
  });
});

describe('poolPorts', () => {
  it('keeps the queue in the user data folder and reads the cap and the budget off the live settings', () => {
    const folder = temporaryFolder('dashboard-queue-');
    let settings = defaultSettings(false);
    const ports = poolPorts(folder, () => settings, () => null, async () => ({ output: '' }));
    expect(ports.saved).toEqual({ next: 1, entries: [] });
    ports.save({ next: 2, entries: [ship] });
    expect(readQueue(path.join(folder, 'pane-queue.json'))).toEqual({ next: 2, entries: [ship] });
    expect(ports.cap()).toBe(4);
    expect(ports.budget()).toBeNull();
    settings = { ...settings, workers: { cap: null } };
    expect(ports.cap()).toBeNull();
  });

  // A full disk loses the queue at the next restart, never the start that was saving it.
  it('keeps going when the file cannot be written', () => {
    const folder = temporaryFolder('dashboard-queue-');
    writeFileSync(path.join(folder, 'file'), '');
    const ports = poolPorts(path.join(folder, 'file'), () => defaultSettings(false), () => null, async () => ({ output: '' }));
    expect(() => ports.save({ next: 1, entries: [] })).not.toThrow();
  });
});
