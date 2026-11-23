import { describe, expect, it } from 'vitest';
import { sweepLeftovers, type LeftoverPorts } from './leftover-worktrees';

const PROJECT = '/code/new-crm';
const ROOT = '/code/new-crm.worktrees';
const MERGED = 'a1b2c3';

type Folder = { dirty?: boolean; head?: string; merged?: string | null; process?: boolean; gh?: 'fails' };

// A project whose `.worktrees` folder holds these, every one clean, merged at its HEAD and empty of
// processes unless it says otherwise. Answers what was removed.
async function sweep(folders: Record<string, Folder>, over: Partial<LeftoverPorts> = {}): Promise<string[]> {
  const removed: string[] = [];
  const at = (path: string): Folder => folders[path] ?? {};
  await sweepLeftovers({
    projectPaths: () => [PROJECT],
    recorded: () => [],
    list: async () => Object.keys(folders).map((worktreePath) => ({ projectPath: PROJECT, worktreePath, branch: 'b' })),
    dirty: async (path) => at(path).dirty ?? false,
    head: async (path) => `${at(path).head ?? MERGED}\n`,
    mergedHead: async (path) => {
      if (at(path).gh === 'fails') throw new Error('gh: not signed in');
      const { merged } = at(path);
      return merged === undefined ? MERGED : merged;
    },
    processIn: async (path) => at(path).process ?? false,
    remove: async (path) => { removed.push(path); },
    ...over,
  });
  return removed;
}

describe('sweepLeftovers', () => {
  it('removes a merged, clean worktree with nobody in it', async () => {
    expect(await sweep({ [`${ROOT}/fix-stories-migration`]: {} })).toEqual([`${ROOT}/fix-stories-migration`]);
  });

  it('keeps every worktree where something could be lost', async () => {
    expect(await sweep({
      [`${ROOT}/dirty`]: { dirty: true },
      [`${ROOT}/committed-after-merge`]: { head: 'ffffff' },
      [`${ROOT}/open`]: { merged: null },
      [`${ROOT}/running`]: { process: true },
      [`${ROOT}/offline`]: { gh: 'fails' },
    })).toEqual([]);
  });

  // The review sweep's to remove, or a cancelled card's to keep (board-decision-4).
  it('leaves a recorded worktree alone', async () => {
    expect(await sweep({ [`${ROOT}/card`]: {} }, { recorded: () => [`${ROOT}/card`] })).toEqual([]);
  });

  it('leaves a worktree outside the project\'s worktrees folder alone', async () => {
    expect(await sweep({ '/elsewhere/by-hand': {} })).toEqual([]);
  });
});
