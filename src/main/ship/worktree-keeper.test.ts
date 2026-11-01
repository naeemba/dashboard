import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readWorktrees } from './worktree-store';
import { worktreeKeeper } from './worktree-keeper';
import type { WorktreeEntry, WorktreeList } from '../../shared/app/bridge';
import type { PaneCommand } from '../../shared/panes/pane-reading';

const folder = mkdtempSync(join(tmpdir(), 'dashboard-keeper-'));
const projectPath = join(folder, 'project');
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function entry(worktreePath: string, cardId: string): WorktreeEntry {
  return {
    cardId, title: cardId, projectPath, branch: cardId, worktreePath,
    pane: 2, startedAt: '2026-11-01T09:00:00.000Z', reviewing: false,
  };
}

function keeperWith(entries: WorktreeEntry[], commands: Map<string, PaneCommand>) {
  const file = join(mkdtempSync(join(folder, 'record-')), 'worktrees.json');
  const sent: WorktreeList[] = [];
  const keeper = worktreeKeeper({ file, entries, commands, shells: new Map(), announce: (list) => sent.push(list) });
  return { keeper, file, sent };
}

describe('dropDead', () => {
  it('drops a record whose folder is gone, hands its panes back to the project, writes and tells', () => {
    const living = entry(folder, 'living');
    const gone = entry(join(folder, 'gone'), 'gone');
    const commands = new Map<string, PaneCommand>([
      ['0-2', { args: ['claude'], directory: gone.worktreePath }],
      ['0-3', { args: [], directory: living.worktreePath }],
    ]);
    const { keeper, file, sent } = keeperWith([living, gone], commands);
    keeper.dropDead();
    expect(keeper.entries()).toEqual([living]);
    expect(commands.get('0-2')).toEqual({ args: [], directory: projectPath });
    expect(commands.get('0-3')).toEqual({ args: [], directory: living.worktreePath });
    expect(readWorktrees(file)).toEqual([living]);
    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toEqual([living]);
  });

  it('writes and sends nothing when every folder is still there', () => {
    const { keeper, file, sent } = keeperWith([entry(folder, 'living')], new Map());
    keeper.dropDead();
    expect(existsSync(file)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('remove', () => {
  it('keeps a record the sweep would drop while its removal is still running, and lets go after', async () => {
    const gone = entry(join(folder, 'gone-mid-removal'), 'gone');
    const { keeper } = keeperWith([gone], new Map());
    const pending = keeper.remove(gone.worktreePath, false);
    keeper.dropDead();
    expect(keeper.entries()).toEqual([gone]);
    // git fails here, since the project folder does not exist; the hold still has to be let go.
    await pending;
    keeper.dropDead();
    expect(keeper.entries()).toEqual([]);
  });

  it('answers yes for a path with no record and no project', async () => {
    const { keeper, sent } = keeperWith([], new Map());
    expect(await keeper.remove(join(folder, 'nowhere'), false)).toEqual({ ok: true, message: '', dirty: [] });
    expect(sent).toHaveLength(0);
  });
});
