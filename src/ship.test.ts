import { describe, expect, it } from 'vitest';
import { blockingChanges, branchNameFor, freePane, worktreePathFor } from './ship';

const cardId = 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa';

describe('branchNameFor', () => {
  it('makes a branch out of the title', () => {
    expect(branchNameFor('Panes name themselves', cardId, [])).toBe('panes-name-themselves');
  });

  it('collapses punctuation and trims the hyphens off both ends', () => {
    expect(branchNameFor('  Fix "Open a new project…" doing nothing!  ', cardId, []))
      .toBe('fix-open-a-new-project-doing-nothing');
  });

  // A title with no Latin letters in it slugifies to nothing. A branch has to be called something.
  it('falls back to the card id when the title leaves nothing behind', () => {
    expect(branchNameFor('کارت جدید', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('!!!', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('', cardId, [])).toBe('card-fc2b');
  });

  it('never ends on a hyphen, even when the cut lands on one', () => {
    const long = 'a'.repeat(46) + ' and then some more words after it';
    expect(branchNameFor(long, cardId, []).endsWith('-')).toBe(false);
    expect(branchNameFor(long, cardId, []).length).toBeLessThanOrEqual(48);
  });

  it('adds four characters of the card id when the name is taken', () => {
    expect(branchNameFor('Panes name themselves', cardId, ['panes-name-themselves']))
      .toBe('panes-name-themselves-fc2b');
  });

  it('counts up when even that is taken', () => {
    const taken = ['panes-name-themselves', 'panes-name-themselves-fc2b'];
    expect(branchNameFor('Panes name themselves', cardId, taken)).toBe('panes-name-themselves-fc2b-2');
  });

  it('reserves room for the id suffix, so a collision does not push the branch past the limit', () => {
    const long = 'a'.repeat(46) + ' and then some more words after it';
    const base = branchNameFor(long, cardId, []);
    const suffixed = branchNameFor(long, cardId, [base]);
    expect(suffixed.endsWith('-')).toBe(false);
    expect(suffixed.length).toBeLessThanOrEqual(48);
  });
});

describe('worktreePathFor', () => {
  // Beside the project, never inside it: nothing to gitignore, and a search in the real checkout
  // never walks into it.
  it('puts the worktree in a sibling folder named after the project', () => {
    expect(worktreePathFor('/Users/sharp/workspace/personal/dashboard', 'panes-name-themselves'))
      .toBe('/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves');
  });

  it('is not confused by a trailing slash on the project path', () => {
    expect(worktreePathFor('/Users/sharp/work/api/', 'bump-deps'))
      .toBe('/Users/sharp/work/api.worktrees/bump-deps');
  });
});

describe('freePane', () => {
  it('takes the lowest pane nobody has typed into', () => {
    expect(freePane([], 5)).toBe(0);
    expect(freePane([0, 1], 5)).toBe(2);
    expect(freePane([1, 3], 5)).toBe(0);
  });

  it('answers null when every pane has been used', () => {
    expect(freePane([0, 1, 2, 3, 4], 5)).toBe(null);
  });
});

describe('blockingChanges', () => {
  // board.json is the app's own file: it is rewritten on every keystroke and put back to HEAD as the
  // ship's first step, so counting it would mean the ship refuses itself.
  it('ignores the board file on its own', () => {
    expect(blockingChanges(' M .dashboard/board.json\n')).toEqual([]);
    expect(blockingChanges('')).toEqual([]);
  });

  it('names every other changed file', () => {
    const porcelain = ' M src/board.ts\n M .dashboard/board.json\n?? docs/notes.md\n';
    expect(blockingChanges(porcelain)).toEqual(['src/board.ts', 'docs/notes.md']);
  });

  it('reads a rename as its new name', () => {
    expect(blockingChanges('R  src/old.ts -> src/new.ts\n')).toEqual(['src/new.ts']);
  });

  it('strips the quotes git puts round a path with a space in it', () => {
    expect(blockingChanges(' M "src/two words.ts"\n')).toEqual(['src/two words.ts']);
  });

  it('does not mistake " -> " in a plain file name for a rename', () => {
    expect(blockingChanges('A  "a -> b.ts"\n')).toEqual(['a -> b.ts']);
  });
});
