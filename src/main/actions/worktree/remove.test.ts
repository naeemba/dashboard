import { describe, expect, it } from 'vitest';
import type { LogDraft } from '../../../shared/app/log-entry';
import { bind } from '../action';
import { removalOf, worktreeRemove } from './remove';

describe('removalOf', () => {
  it.each([
    ['dialog', true, { force: true, queued: true, logged: true, boardChecked: false }],
    ['dialog', false, { force: false, queued: true, logged: true, boardChecked: true }],
    ['throwaway', true, { force: false, queued: true, logged: true, boardChecked: false }],
    ['throwaway', false, { force: false, queued: true, logged: true, boardChecked: false }],
    ['leftover', false, { force: false, queued: true, logged: true, boardChecked: false }],
    ['review', true, { force: false, queued: false, logged: false, boardChecked: true }],
  ] as const)('%s asking force %s', (from, force, expected) => {
    expect(removalOf(from, force)).toEqual(expected);
  });
});

describe('worktree.remove', () => {
  function remover() {
    const asked: { force: boolean; queued: boolean; checked?: string | null }[] = [];
    const logged: LogDraft[] = [];
    let inQueue = false;
    const remove = bind(worktreeRemove, {
      remove: async (worktreePath, force, _projectPath, kept) => {
        asked.push({ force, queued: inQueue, checked: await kept?.(worktreePath) });
        return { ok: true, message: 'removed fix', dirty: [] };
      },
      queue: async (_projectPath, run) => { inQueue = true; try { return await run(); } finally { inQueue = false; } },
      log: (draft) => logged.push(draft),
      boardNotOnOrigin: async (worktreePath) => `${worktreePath}'s board edits never reached origin/main`,
    });
    return { remove, asked, logged };
  }

  it('runs the dialog removal on the project queue, forced as asked, and logs it', async () => {
    const { remove, asked, logged } = remover();
    expect(await remove.call({ worktreePath: '/w/fix', projectPath: '/code/api', force: true, from: 'dialog' })).toMatchObject({ ok: true, output: 'removed fix' });
    expect(asked).toEqual([{ force: true, queued: true }]);
    expect(logged).toHaveLength(1);
  });

  it("asks the dialog's unforced removal whether its board edits reached origin", async () => {
    const { remove, asked } = remover();
    await remove.call({ worktreePath: '/w/fix', projectPath: '/code/api', force: false, from: 'dialog' });
    expect(asked).toEqual([{ force: false, queued: true, checked: "/w/fix's board edits never reached origin/main" }]);
  });

  it('runs the review removal in the queue it already holds, unforced, unlogged and asked about its board edits', async () => {
    const { remove, asked, logged } = remover();
    await remove.call({ worktreePath: '/w/fix', force: true, from: 'review' });
    expect(asked).toEqual([{ force: false, queued: false, checked: "/w/fix's board edits never reached origin/main; keep the edit elsewhere, then git restore .dashboard/board in /w/fix" }]);
    expect(logged).toEqual([]);
  });

  it('refuses a door it does not know', async () => {
    const { remove, asked } = remover();
    expect(await remove.call({ worktreePath: '/w/fix', from: 'cron' })).toHaveProperty('refused');
    expect(asked).toEqual([]);
  });
});
