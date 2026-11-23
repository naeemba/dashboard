import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { AGENT_IDLE_MS, leftoverSweep, type LeftoverPorts } from './leftover-worktrees';

const PROJECT = '/code/new-crm';
const ROOT = '/code/new-crm.worktrees';
const AGENTS = '/code/new-crm/.claude/worktrees';
const MERGED = 'a1b2c3';
const NOW = Date.parse('2026-11-23T12:00:00Z');
const TWO_DAYS_AGO = NOW - 2 * AGENT_IDLE_MS;

type Folder = {
  dirty?: boolean; head?: string; merged?: string | null; process?: boolean; gh?: 'fails'; pushed?: boolean; modifiedAt?: number;
  locked?: true; refused?: boolean;
};

// A project whose worktrees are these, every one clean, merged at its HEAD, pushed, untouched for two
// days and empty of processes unless it says otherwise, swept `times` times. Answers every removal
// asked for, refused or not.
async function sweep(folders: Record<string, Folder>, over: Partial<LeftoverPorts> = {}, times = 1): Promise<string[]> {
  const removed: string[] = [];
  const at = (path: string): Folder => folders[path] ?? {};
  const run = leftoverSweep({
    projectPaths: () => [PROJECT],
    recorded: () => [],
    throwaways: async () => [],
    list: async (projectPath) => Object.entries(folders).map(([worktreePath, { locked }]) =>
      ({ projectPath, worktreePath, branch: 'b', ...(locked ? { locked } : {}) })),
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
    remove: async (path) => {
      removed.push(path);
      return !at(path).refused;
    },
    ...over,
  });
  for (let sweeps = 0; sweeps < times; sweeps += 1) await run();
  return removed;
}

describe('leftoverSweep', () => {
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
      [`${ROOT}/locked`]: { locked: true },
    })).toEqual([]);
  });

  // A worktree with submodules: git refuses every unforced remove, and the log would say so each sweep.
  it('does not ask again this run to remove a worktree git refused', async () => {
    expect(await sweep({ [`${ROOT}/submodules`]: { refused: true } }, {}, 2)).toEqual([`${ROOT}/submodules`]);
  });

  // The same repository open twice, and one of its worktrees open as a project of its own.
  it('asks about a worktree once however many open projects list it, and never about an open one', async () => {
    const projectPaths = () => [PROJECT, PROJECT, `${ROOT}/opened`];
    expect(await sweep({ [`${ROOT}/fix`]: {}, [`${ROOT}/opened`]: {} }, { projectPaths })).toEqual([`${ROOT}/fix`]);
  });

  // The review sweep's to remove, or a cancelled card's to keep (board-decision-4).
  it('leaves a recorded worktree alone', async () => {
    expect(await sweep({ [`${ROOT}/card`]: {} }, { recorded: () => [`${ROOT}/card`] })).toEqual([]);
  });

  // A marked throwaway is worktree.sweep's and its pane's: one mechanism for it, not two.
  it('leaves a marked throwaway alone', async () => {
    expect(await sweep({ [`${ROOT}/research`]: {} }, { throwaways: async () => [`${ROOT}/research`] })).toEqual([]);
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

  // `claude --worktree <name>` puts a session's worktree there too, and asks whether to keep it.
  it('leaves a worktree under .claude/worktrees alone unless a workflow made it', async () => {
    expect(await sweep({ [`${AGENTS}/phase-6-portfolio`]: {} })).toEqual([]);
  });

  // A .claude/worktrees symlinked to a shared folder would make every worktree there a candidate.
  it('leaves a .claude/worktrees that resolves outside the project alone', async () => {
    const folder = temporaryFolder('dashboard-leftovers-');
    const project = join(folder, 'new-crm');
    const shared = join(folder, 'shared');
    mkdirSync(join(project, '.claude'), { recursive: true });
    mkdirSync(join(shared, 'wf_a-1'), { recursive: true });
    symlinkSync(shared, join(project, '.claude', 'worktrees'));
    const worktree = join(project, '.claude', 'worktrees', 'wf_a-1');
    expect(await sweep({ [worktree]: {} }, { projectPaths: () => [project] })).toEqual([]);
  });
});
