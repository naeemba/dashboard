import { describe, expect, it } from 'vitest';
import { dirtyLabel, orderedWorktrees } from './worktree-rows';
import type { WorktreeEntry } from './worktree-store';

function entry(cardId: string, startedAt: string): WorktreeEntry {
  return {
    cardId,
    title: cardId,
    projectPath: '/work/api',
    branch: cardId,
    worktreePath: `/work/api.worktrees/${cardId}`,
    pane: null,
    startedAt,
  };
}

describe('orderedWorktrees', () => {
  // withEntry appends a replaced entry, so store order is "whichever was touched last", which is not
  // an order anything on screen explains.
  it('puts the newest first, whatever order the store held them in', () => {
    const stored = [
      entry('old', '2026-09-01T10:00:00.000Z'),
      entry('newest', '2026-09-09T10:00:00.000Z'),
      entry('middle', '2026-09-05T10:00:00.000Z'),
    ];
    expect(orderedWorktrees(stored).map((row) => row.cardId)).toEqual(['newest', 'middle', 'old']);
  });

  it('leaves the array it was given alone, because that is the record the dialog holds', () => {
    const stored = [entry('old', '2026-09-01T10:00:00.000Z'), entry('new', '2026-09-09T10:00:00.000Z')];
    orderedWorktrees(stored);
    expect(stored.map((row) => row.cardId)).toEqual(['old', 'new']);
  });
});

describe('dirtyLabel', () => {
  const path = '/work/api.worktrees/one';
  const none = new Set<string>();

  it('says nothing until the first answer has come back', () => {
    expect(dirtyLabel(path, false, new Set([path]), none)).toBe('…');
  });

  it('names the two answers git can give', () => {
    expect(dirtyLabel(path, true, new Set([path]), none)).toBe('DIRTY');
    expect(dirtyLabel(path, true, none, none)).toBe('clean');
  });

  // The one that costs something. `d` acts on this row, and "clean" about a worktree git could not
  // read is the dialog claiming something it does not know.
  it('never calls a worktree it could not read clean', () => {
    expect(dirtyLabel(path, true, none, new Set([path]))).toBe('unknown');
  });
});
