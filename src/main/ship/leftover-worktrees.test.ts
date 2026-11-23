import { describe, expect, it } from 'vitest';
import { AGENT_IDLE_MS, sweepLeftovers, type LeftoverPorts } from './leftover-worktrees';

const PROJECT = '/code/new-crm';
const ROOT = '/code/new-crm.worktrees';
const AGENTS = '/code/new-crm/.claude/worktrees';
const MERGED = 'a1b2c3';
const NOW = Date.parse('2026-11-23T12:00:00Z');
const TWO_DAYS_AGO = NOW - 2 * AGENT_IDLE_MS;

type Folder = {
  dirty?: boolean; head?: string; merged?: string | null; process?: boolean; gh?: 'fails'; pushed?: boolean; modifiedAt?: number;
};

// A project whose worktrees are these, every one clean, merged at its HEAD, pushed, untouched for two
// days and empty of processes unless it says otherwise. Answers what was removed.
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
    pushed: async (path) => at(path).pushed ?? true,
    modifiedAt: async (path) => at(path).modifiedAt ?? TWO_DAYS_AGO,
    now: () => NOW,
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

  // A workflow agent's worktree has no pull request: pushed and a day quiet is the whole test.
  it('removes a pushed, clean workflow agent worktree untouched for a day, merged or not', async () => {
    expect(await sweep({ [`${AGENTS}/wf_0180f677-04a-3`]: { merged: null } })).toEqual([`${AGENTS}/wf_0180f677-04a-3`]);
  });

  it('keeps a workflow agent worktree where something could be lost', async () => {
    expect(await sweep({
      [`${AGENTS}/wf_a-1`]: { dirty: true },
      [`${AGENTS}/wf_a-2`]: { pushed: false },
      [`${AGENTS}/wf_a-3`]: { modifiedAt: NOW - 60_000 },
      [`${AGENTS}/wf_a-4`]: { process: true },
    })).toEqual([]);
  });
});
