import { describe, expect, it } from 'vitest';
import {
  claimsPane,
  entryForCard,
  entryForPath,
  livingEntries,
  parseWorktrees,
  withEntry,
  withoutWorktree,
  type WorktreeEntry,
} from './worktree-store';

const entry: WorktreeEntry = {
  cardId: 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa',
  title: 'Panes name themselves',
  projectPath: '/Users/sharp/workspace/personal/dashboard',
  branch: 'panes-name-themselves',
  worktreePath: '/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves',
  pane: 2,
  startedAt: '2026-09-10T09:14:22.104Z',
};

describe('parseWorktrees', () => {
  it('keeps an entry as it was written', () => {
    expect(parseWorktrees({ entries: [entry] })).toEqual([entry]);
  });

  it('reads nothing out of a file that is not a record of worktrees', () => {
    expect(parseWorktrees(null)).toEqual([]);
    expect(parseWorktrees('[]')).toEqual([]);
    expect(parseWorktrees({})).toEqual([]);
    expect(parseWorktrees({ entries: 'no' })).toEqual([]);
  });

  // Every field but the pane names something that has to exist for the entry to mean anything. An
  // entry missing one of them cannot be shown, jumped to or removed, so it is dropped rather than
  // kept as a row that does nothing.
  it('drops an entry missing a field it cannot do without, and keeps the others', () => {
    const stored = { entries: [{ ...entry, worktreePath: '' }, entry, { cardId: 'x' }] };
    expect(parseWorktrees(stored)).toEqual([entry]);
  });

  // A worktree that was made but never got a pane is a real state: it is what the flow leaves behind
  // when every pane in the project has been typed into.
  it('keeps an entry with no pane', () => {
    expect(parseWorktrees({ entries: [{ ...entry, pane: null }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 'two' }] })[0].pane).toBe(null);
    expect(parseWorktrees({ entries: [{ ...entry, pane: 1.5 }] })[0].pane).toBe(null);
  });
});

describe('entryForCard', () => {
  it('finds the entry a card is shipped under', () => {
    expect(entryForCard([entry], entry.cardId)).toBe(entry);
    expect(entryForCard([entry], 'nobody')).toBe(undefined);
  });
});

describe('entryForPath', () => {
  it('finds the entry a folder belongs to', () => {
    expect(entryForPath([entry], entry.worktreePath)).toBe(entry);
    expect(entryForPath([entry], '/nowhere')).toBe(undefined);
  });
});

describe('withEntry', () => {
  it('adds an entry that is not there', () => {
    expect(withEntry([], entry)).toEqual([entry]);
  });

  // Taking the pane happens after the worktree is recorded, so the second write replaces the first.
  it('replaces the entry for a card already recorded', () => {
    const withPane = { ...entry, pane: 4 };
    expect(withEntry([entry], withPane)).toEqual([withPane]);
  });
});

describe('withoutWorktree', () => {
  it('drops the entry for a worktree that has been removed', () => {
    expect(withoutWorktree([entry], entry.worktreePath)).toEqual([]);
    expect(withoutWorktree([entry], '/somewhere/else')).toEqual([entry]);
  });
});

describe('livingEntries', () => {
  // A worktree deleted by hand with `git worktree remove` must not leave a card marked in flight
  // forever, with nothing on screen able to clear it.
  it('drops entries whose folder has gone', () => {
    const gone = { ...entry, cardId: 'other', worktreePath: '/gone' };
    expect(livingEntries([entry, gone], (path) => path !== '/gone')).toEqual([entry]);
  });
});

describe('claimsPane', () => {
  const other: WorktreeEntry = {
    ...entry,
    cardId: 'aaaaaaaa-1234-4321-8888-bbbbbbbbbbbb',
    title: 'A card in another project',
    projectPath: '/Users/sharp/workspace/personal/api',
    branch: 'a-card-in-another-project',
    worktreePath: '/Users/sharp/workspace/personal/api.worktrees/a-card-in-another-project',
  };

  it('finds the other card holding that pane in that project', () => {
    expect(claimsPane([entry], entry.projectPath, 2, 'some-other-card')?.cardId).toBe(entry.cardId);
  });

  // Pane numbers are per project, so the same number in another project is another pane. Matching it
  // takes the branch off a pane whose agent is still running, two projects over.
  it('leaves the same pane number in another project alone', () => {
    expect(claimsPane([other], entry.projectPath, 2, 'some-other-card')).toBeUndefined();
  });

  it('is undefined for the card taking the pane itself', () => {
    expect(claimsPane([entry], entry.projectPath, 2, entry.cardId)).toBeUndefined();
  });
});
