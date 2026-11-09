import { describe, expect, it } from 'vitest';
import type { BoardSync } from './board-sync-git';
import { boardSyncQueue } from './board-sync-queue';

const synced: BoardSync = { synced: true, checkout: 'current' };
const offline: BoardSync = { synced: false, warning: 'offline' };

// A sync that finishes only when the test says so.
function heldSync() {
  const started: string[] = [];
  const finish: (() => void)[] = [];
  let answer: BoardSync = synced;
  return {
    started,
    answerWith(next: BoardSync) { answer = next; },
    release() { finish.shift()?.(); },
    sync(projectPath: string): Promise<BoardSync> {
      started.push(projectPath);
      return new Promise((resolve) => finish.push(() => resolve(answer)));
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('boardSyncQueue', () => {
  it('runs one sync at a time per project and folds a burst into one more', async () => {
    const held = heldSync();
    const queue = boardSyncQueue(held.sync, () => {});
    const first = queue.sync('/p');
    // Asked before the first had started: that sync is after it, so it is this ask's too.
    expect(queue.sync('/p')).toBe(first);
    await settle();
    const second = queue.sync('/p');
    const third = queue.sync('/p');
    await settle();
    expect(held.started).toEqual(['/p']);
    expect(third).toBe(second);
    held.release();
    await first;
    await settle();
    expect(held.started).toEqual(['/p', '/p']);
    held.release();
    await second;
    expect(held.started).toHaveLength(2);
  });

  it('settles an ask only after a sync that started after it', async () => {
    const held = heldSync();
    const queue = boardSyncQueue(held.sync, () => {});
    void queue.sync('/p');
    await settle();
    let done = false;
    void queue.sync('/p').then(() => { done = true; });
    held.release();
    await settle();
    expect(done).toBe(false);
    held.release();
    await settle();
    expect(done).toBe(true);
  });

  it('keeps projects apart', async () => {
    const held = heldSync();
    const queue = boardSyncQueue(held.sync, () => {});
    void queue.sync('/a');
    void queue.sync('/b');
    await settle();
    expect(held.started).toEqual(['/a', '/b']);
  });

  it('warns once while a project stays offline, and again after it came back', async () => {
    const warnings: string[] = [];
    const answers = [offline, offline, synced, offline];
    const queue = boardSyncQueue(async () => answers.shift()!, (projectPath, message) => warnings.push(`${projectPath}: ${message}`));
    for (let count = 0; count < 4; count += 1) await queue.sync('/p');
    expect(warnings).toEqual(['/p: offline', '/p: offline']);
  });

  it('warns about a sync that throws, and goes on to the next', async () => {
    const warnings: string[] = [];
    let calls = 0;
    const queue = boardSyncQueue(async () => {
      calls += 1;
      if (calls === 1) throw new Error('git is gone');
      return synced;
    }, (_projectPath, message) => warnings.push(message));
    await queue.sync('/p');
    await queue.sync('/p');
    expect(calls).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('git is gone');
  });

  it('says nothing about a board git does not track', async () => {
    const warnings: string[] = [];
    const queue = boardSyncQueue(async () => ({ synced: false, warning: null }), (_projectPath, message) => warnings.push(message));
    await queue.sync('/p');
    expect(warnings).toEqual([]);
  });
});
