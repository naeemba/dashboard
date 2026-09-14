import { describe, expect, it } from 'vitest';
import {
  EDITOR_INDEX, TERMINAL_COUNT, branchOfPane, modeOfPane, neighbor, paneFromId, paneIds, paneLabel, paneName,
  startsEditor, terminalId,
} from './terminals';

describe('paneIds', () => {
  // The six a project is made of: the grid's five and the editor one past them. Main kills a project's
  // panes by this list and the renderer lets them go by it, so a sixth grid pane added to the layout
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

  // The name goes last so a truncated status bar drops it before it drops the branch, which is the
  // part that stops a command landing in the wrong checkout.
  // The editor is a pane like the others to everything that lists panes — the manager's rows, the
  // sentence that refuses to close a project — and `terminal 6` names a pane that is not in the grid.
  it('calls the editor nvim rather than a sixth terminal', () => {
    expect(paneLabel(EDITOR_INDEX)).toBe('nvim');
    expect(paneLabel(EDITOR_INDEX, undefined, 'board.json')).toBe('nvim · board.json');
  });

  it('adds the name after the branch, and reads without one', () => {
    expect(paneLabel(2, undefined, 'dev server')).toBe('terminal 3 · dev server');
    expect(paneLabel(2, 'panes-name-themselves', 'dev server'))
      .toBe('terminal 3 · panes-name-themselves · dev server');
  });
});

describe('paneName', () => {
  it('has nothing to say about a pane that has never been named', () => {
    expect(paneName({})).toBeUndefined();
  });

  // A title is a hint: the shell rewrites it on every prompt, so it is taken only when nothing better
  // is set. Take it over a typed name and the name you chose is gone by the next `ls`.
  it('prefers the name you typed over the title the program set', () => {
    expect(paneName({ title: 'npm test' })).toBe('npm test');
    expect(paneName({ typedName: 'dev server', title: 'npm test' })).toBe('dev server');
  });

  // Clearing the name is how you go back to following the title, so an empty name is no name rather
  // than a pane labelled `terminal 3 · `. Same for a title, which a program can set to nothing at all.
  it('ignores a name or a title that is blank', () => {
    expect(paneName({ typedName: '', title: 'npm test' })).toBe('npm test');
    expect(paneName({ typedName: '   ', title: '' })).toBeUndefined();
    expect(paneName({ title: '  ' })).toBeUndefined();
  });

  // Trimmed once here rather than at each end that stores one: a name typed with a stray space is the
  // same name, and the overlay, the session file and the title all arrive through this.
  it('trims what it gives back', () => {
    expect(paneName({ typedName: '  dev server  ' })).toBe('dev server');
  });

  // A title is whatever the program in the pane printed, and neither place a name is drawn can shrink
  // below its text: the status bar is one line whose right end says which pane is ringing, and the
  // manager's row keeps its state and age at the far end. Unbounded, one zsh theme that titles the
  // window with the full path pushes both off the window.
  it('cuts a name too long for the line it goes on', () => {
    const long = 'working on the pane naming card in the dashboard repository';
    expect(paneName({ title: long })).toBe('working on the pane naming card in the …');
    expect(paneName({ typedName: long })).toBe('working on the pane naming card in the …');
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

describe('startsEditor', () => {
  it('starts nvim the first time it is asked for', () => {
    expect(startsEditor({ started: false, exited: false })).toBe(true);
  });

  it('leaves a running nvim alone, so coming back to it does not throw away what is open', () => {
    expect(startsEditor({ started: true, exited: false })).toBe(false);
  });

  // Quit nvim, go and look at a test run, come back: the pane restarts rather than sitting on its
  // exit line. The scrollback key needs this — it has nothing to hand a file to otherwise.
  it('starts it again after it has been quit', () => {
    expect(startsEditor({ started: true, exited: true })).toBe(true);
  });
});
