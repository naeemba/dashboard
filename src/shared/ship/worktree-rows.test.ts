import { describe, expect, it } from 'vitest';
import { dirtyLabel, dirtySummary, orderedWorktrees, worktreePaneText } from './worktree-rows';
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
    reviewing: false,
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
    expect(dirtyLabel(path, true, new Set([path]), none)).toBe('dirty');
    expect(dirtyLabel(path, true, none, none)).toBe('clean');
  });

  // The one that costs something. `d` acts on this row, and "clean" about a worktree git could not
  // read is the dialog claiming something it does not know.
  it('never calls a worktree it could not read clean', () => {
    expect(dirtyLabel(path, true, none, new Set([path]))).toBe('unknown');
  });
});

describe('worktreePaneText', () => {
  it('names the pane the agent runs in, or says there is none', () => {
    expect(worktreePaneText(entry('a', '2026-09-01T00:00:00Z'))).toBe('no pane');
    expect(worktreePaneText({ ...entry('a', '2026-09-01T00:00:00Z'), pane: 2 })).toBe('terminal 3');
  });
});

describe('dirtySummary', () => {
  const paths = ['/w/one', '/w/two', '/w/three'];
  const none = new Set<string>();

  it('claims nothing before the first answer has come back', () => {
    expect(dirtySummary(paths, false, new Set(['/w/one']), none)).toEqual({ text: 'checking…', attention: false });
  });

  it('says nothing is uncommitted only when every worktree was answered for clean', () => {
    expect(dirtySummary(paths, true, none, none)).toEqual({ text: 'nothing uncommitted', attention: false });
  });

  // A worktree git could not read is not a clean one.
  it('counts the dirty and the unknown apart, and asks to be looked at for either', () => {
    expect(dirtySummary(paths, true, new Set(['/w/one']), new Set(['/w/two'])))
      .toEqual({ text: '1 with uncommitted changes · 1 unknown', attention: true });
    expect(dirtySummary(paths, true, none, new Set(['/w/two']))).toEqual({ text: '1 unknown', attention: true });
  });

  it('leaves out an answer about a worktree that is not on the list', () => {
    expect(dirtySummary(['/w/one'], true, new Set(['/gone']), none).text).toBe('nothing uncommitted');
  });
});
