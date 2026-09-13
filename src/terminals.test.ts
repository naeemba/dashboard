import { describe, expect, it } from 'vitest';
import {
  EDITOR_INDEX, TERMINAL_COUNT, branchOfPane, modeOfPane, neighbor, paneFromId, paneIds, paneLabel,
  terminalId,
} from './terminals';

describe('paneIds', () => {
  // The six a project is made of: the grid's five and the editor one past them. Main spawns and kills
  // them by this list and the renderer lets them go by it, so a seventh pane added to the layout
  // reaches both without either being edited.
  it('names every pane of one project, the editor last', () => {
    expect(paneIds(3)).toEqual(['3:0', '3:1', '3:2', '3:3', '3:4', '3:5']);
    expect(paneIds(0)).toHaveLength(TERMINAL_COUNT + 1);
    expect(paneIds(0)[EDITOR_INDEX]).toBe(terminalId(0, EDITOR_INDEX));
  });
});

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
  const entries = [{
    worktreePath: '/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves',
    branch: 'panes-name-themselves',
  }];

  it('finds the branch of the worktree the pane is sitting in', () => {
    expect(branchOfPane(entries, entries[0].worktreePath)).toBe('panes-name-themselves');
  });

  it('is undefined for a pane on the project checkout', () => {
    expect(branchOfPane(entries, '/Users/sharp/workspace/personal/dashboard')).toBeUndefined();
  });

  // A pane whose shell has no folder recorded yet. Matching it to the first worktree would label a
  // shell that is not in one.
  it('is undefined when the pane has no directory', () => {
    expect(branchOfPane(entries, '')).toBeUndefined();
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
