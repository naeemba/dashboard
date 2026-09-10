import { describe, expect, it } from 'vitest';
import {
  EDITOR_INDEX, TERMINAL_COUNT, branchOfPane, modeOfPane, neighbor, paneFromId, paneLabel, terminalId,
} from './terminals';

describe('neighbor', () => {
  it('moves along a row and stops at the edge', () => {
    expect(neighbor(0, 'right')).toBe(1);
    expect(neighbor(1, 'right')).toBe(1);
    expect(neighbor(3, 'left')).toBe(2);
    expect(neighbor(2, 'left')).toBe(2);
  });

  it('moves between rows by horizontal position', () => {
    expect(neighbor(0, 'down')).toBe(2);
    expect(neighbor(1, 'down')).toBe(4);
    expect(neighbor(2, 'up')).toBe(0);
    expect(neighbor(4, 'up')).toBe(1);
    expect(neighbor(0, 'up')).toBe(0);
    expect(neighbor(3, 'down')).toBe(3);
  });
});

describe('paneLabel', () => {
  it('names a pane by its number', () => {
    expect(paneLabel(0)).toBe('terminal 1');
    expect(paneLabel(2)).toBe('terminal 3');
  });

  // The numbering stays, because the focus keys are numbered. The branch is added to it, not swapped
  // for it.
  it('adds the branch when the pane is on a worktree', () => {
    expect(paneLabel(2, 'panes-name-themselves')).toBe('terminal 3 · panes-name-themselves');
  });
});

describe('branchOfPane', () => {
  it('finds the branch of the entry holding that pane', () => {
    const entries = [{ pane: 1, branch: 'panes-name-themselves' }];
    expect(branchOfPane(entries, 1)).toBe('panes-name-themselves');
  });

  it('is undefined when no entry holds that pane', () => {
    expect(branchOfPane([{ pane: 1, branch: 'panes-name-themselves' }], 0)).toBeUndefined();
  });

  // null means the worktree was made with every pane already in use — no pane at all, not pane 0.
  // Matching it to pane 0 would label the wrong shell, which is the failure this function exists to
  // prevent.
  it('never matches a null pane to pane 0', () => {
    const entries = [{ pane: null, branch: 'panes-name-themselves' }];
    expect(branchOfPane(entries, 0)).toBeUndefined();
  });
});

describe('paneFromId', () => {
  it('reads back what terminalId wrote', () => {
    expect(paneFromId(terminalId(3, 2))).toEqual({ slot: 3, index: 2 });
    expect(paneFromId(terminalId(12, 5))).toEqual({ slot: 12, index: 5 });
  });
});

describe('modeOfPane', () => {
  it('puts the grid on terminals and the editor on nvim', () => {
    expect(modeOfPane(0)).toBe('terminals');
    expect(modeOfPane(TERMINAL_COUNT - 1)).toBe('terminals');
    expect(modeOfPane(EDITOR_INDEX)).toBe('nvim');
  });
});
