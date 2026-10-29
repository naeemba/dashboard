import { describe, expect, it } from 'vitest';
import {
  CHAT_INDEX, DEFAULT_PANE_SIZE, EDITOR_INDEX, MAIN_INDEX, branchOfPane, isWorker, modeOfPane, paneFromId,
  paneLabel, paneName, sizeOfPane, startsEditor, terminalId,
} from './terminals';

describe('paneLabel', () => {
  it('names a worker by its number', () => {
    expect(paneLabel(1)).toBe('terminal 2');
    expect(paneLabel(2)).toBe('terminal 3');
  });

  // Main is not the first worker, and a column of workers under `terminal 1` would say it was.
  it('calls the main session main', () => {
    expect(paneLabel(MAIN_INDEX)).toBe('main');
  });

  // The numbering stays, because the focus keys are numbered. The branch is added to it, not swapped
  // for it.
  it('adds the branch when the pane is on a worktree', () => {
    expect(paneLabel(2, 'panes-name-themselves')).toBe('terminal 3 · panes-name-themselves');
  });

  // The name goes last so a truncated status bar drops it before it drops the branch, which is the
  // part that stops a command landing in the wrong checkout.
  // The editor is a pane like the others to everything that lists panes — the manager's rows, the
  // sentence that refuses to close a project — and it is numbered below the terminals.
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

describe('isWorker', () => {
  it('counts the panes after main and nothing else', () => {
    expect(isWorker(3)).toBe(true);
    expect(isWorker(MAIN_INDEX)).toBe(false);
    expect(isWorker(EDITOR_INDEX)).toBe(false);
    expect(isWorker(CHAT_INDEX)).toBe(false);
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
    expect(paneName({ title: long })).toBe('working on the pane naming card in the…');
    expect(paneName({ typedName: long })).toBe('working on the pane naming card in the…');
  });

  // The cut lands wherever the name happens to be long enough, which is as often just after a space as
  // mid-word. Left there, the space sits in front of the ellipsis as a gap the ellipsis already says.
  it('eats the space it cut at', () => {
    expect(paneName({ title: `${'a'.repeat(38)} tail` })).toBe(`${'a'.repeat(38)}…`);
  });

  // A length counted in UTF-16 units cuts through the middle of an emoji, and the half that survives
  // is drawn as a `\ufffd` in the status bar and the manager's row.
  it('cuts on whole characters, not halves of one', () => {
    expect(paneName({ title: '🙂'.repeat(41) })).toBe(`${'🙂'.repeat(39)}…`);
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
    expect(paneFromId(terminalId(4, EDITOR_INDEX))).toEqual({ slot: 4, index: EDITOR_INDEX });
  });
});

describe('modeOfPane', () => {
  it('puts main and the workers on terminals and the editor on nvim', () => {
    expect(modeOfPane(MAIN_INDEX)).toBe('terminals');
    expect(modeOfPane(12)).toBe('terminals');
    expect(modeOfPane(EDITOR_INDEX)).toBe('nvim');
  });

  // A Claude screen's notification carries this index back, and the click has to land on that screen.
  it('puts the Claude screen on claude', () => {
    expect(modeOfPane(CHAT_INDEX)).toBe('claude');
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

describe('sizeOfPane', () => {
  // A ship takes a pane that is already on screen and starts the agent in it. The pane was measured
  // long ago and nothing about it changes, so no new size is ever sent — spawn at the default and the
  // agent draws its prompt box at 80 columns inside a pane twice that wide, and stays there.
  it('gives a measured pane the size it reported', () => {
    const map = new Map([['0:2', { cols: 163, rows: 42 }]]);
    const sizes = { sizeOf: (id: string) => map.get(id) };
    expect(sizeOfPane(sizes, '0:2')).toEqual({ cols: 163, rows: 42 });
  });

  // Matches xterm's own starting size on purpose. A pane nobody has measured is 80x24 in the renderer
  // too, so both halves agree from the first byte and the first fit has nothing to correct.
  it('gives an unmeasured pane the size a fresh terminal already is', () => {
    expect(sizeOfPane({ sizeOf: () => undefined }, '0:2')).toBe(DEFAULT_PANE_SIZE);
    expect(DEFAULT_PANE_SIZE).toEqual({ cols: 80, rows: 24 });
  });
});
