import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { boardFolderPath, peekBoard } from '../board/board-store';
import { defaultSettings } from '../../shared/settings/settings';
import type { QueueEntry } from './pane-pool';
import { poolPorts } from './pane-pool-ports';
import { readQueue } from './pane-queue-store';

const ship: QueueEntry = {
  id: 'q4', dispatcherPath: '/work/api', projectPath: '/work/crm', cardId: 'a', after: null, returnTo: { from: 'Todo', into: 'Ship' },
  queuedAt: '2026-11-26T12:00:00.000Z', work: { kind: 'ship', title: 'A' },
};

describe('poolPorts', () => {
  const cards = { beginCard: async () => ({ output: '' }), move: async () => ({ output: '' }) };
  it('keeps the queue in the user data folder and reads the cap and the budget off the live settings', () => {
    const folder = temporaryFolder('dashboard-queue-');
    let settings = defaultSettings(false);
    const ports = poolPorts(folder, () => settings, cards);
    expect(ports.saved).toEqual({ next: 1, entries: [] });
    ports.save({ next: 2, entries: [ship] });
    expect(readQueue(path.join(folder, 'pane-queue.json'))).toEqual({ next: 2, entries: [ship] });
    expect(ports.cap()).toBe(4);
    expect(ports.budget()).toBeNull();
    settings = { ...settings, workers: { cap: null } };
    expect(ports.cap()).toBeNull();
  });

  // peekBoard skips a card file that does not parse, and the pool would then drop that card's start.
  it('reads no board while a card file does not parse', () => {
    const project = temporaryFolder('dashboard-board-');
    const cardsFolder = path.join(boardFolderPath(project), 'cards');
    mkdirSync(cardsFolder, { recursive: true });
    writeFileSync(path.join(cardsFolder, 'a.json'), '{ half saved');
    expect(peekBoard(project)).not.toBeNull();
    expect(poolPorts(temporaryFolder('dashboard-queue-'), () => defaultSettings(false), cards).board(project)).toBeNull();
  });

  // A full disk loses the queue at the next restart, never the start that was saving it.
  it('keeps going when the file cannot be written', () => {
    const folder = temporaryFolder('dashboard-queue-');
    writeFileSync(path.join(folder, 'file'), '');
    const ports = poolPorts(path.join(folder, 'file'), () => defaultSettings(false), cards);
    expect(() => ports.save({ next: 1, entries: [] })).not.toThrow();
  });
});
