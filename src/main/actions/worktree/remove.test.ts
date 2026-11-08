import { describe, expect, it } from 'vitest';
import type { LogDraft } from '../../../shared/app/log-entry';
import { bind } from '../action';
import { removalOf, worktreeRemove } from './remove';

describe('removalOf', () => {
  it.each([
    ['dialog', true, { force: true, queued: true, logged: true }],
    ['dialog', false, { force: false, queued: true, logged: true }],
    ['release', true, { force: false, queued: true, logged: true }],
    ['review', true, { force: false, queued: false, logged: false }],
  ] as const)('%s asking force %s', (from, force, expected) => {
    expect(removalOf(from, force)).toEqual(expected);
  });
});

describe('worktree.remove', () => {
  function remover() {
    const asked: { force: boolean; queued: boolean }[] = [];
    const logged: LogDraft[] = [];
    let inQueue = false;
    const remove = bind(worktreeRemove, {
      remove: async (_worktreePath, force) => { asked.push({ force, queued: inQueue }); return { ok: true, message: 'removed fix', dirty: [] }; },
      queue: async (_projectPath, run) => { inQueue = true; try { return await run(); } finally { inQueue = false; } },
      log: (draft) => logged.push(draft),
    });
    return { remove, asked, logged };
  }

  it('runs the dialog removal on the project queue, forced as asked, and logs it', async () => {
    const { remove, asked, logged } = remover();
    expect(await remove.call({ worktreePath: '/w/fix', projectPath: '/code/api', force: true, from: 'dialog' })).toMatchObject({ ok: true, output: 'removed fix' });
    expect(asked).toEqual([{ force: true, queued: true }]);
    expect(logged).toHaveLength(1);
  });

  it('runs the review removal in the queue it already holds, unforced and unlogged', async () => {
    const { remove, asked, logged } = remover();
    await remove.call({ worktreePath: '/w/fix', force: true, from: 'review' });
    expect(asked).toEqual([{ force: false, queued: false }]);
    expect(logged).toEqual([]);
  });

  it('refuses a door it does not know', async () => {
    const { remove, asked } = remover();
    expect(await remove.call({ worktreePath: '/w/fix', from: 'sweep' })).toHaveProperty('refused');
    expect(asked).toEqual([]);
  });
});
