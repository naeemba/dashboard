import { describe, expect, it } from 'vitest';
import { managerLabel, modeLabel, terminalStatus, type StatusPage } from './status';

function page(overrides: Partial<StatusPage>): StatusPage {
  return {
    mode: 'terminals',
    focused: 0,
    paneCount: 5,
    boardLabel: '',
    hasProjects: true,
    managerStatusLabel: '',
    commandStatusLabel: '',
    pickerBinding: '',
    pickerDescription: '',
    worktrees: [],
    focusedDirectory: '',
    ...overrides,
  };
}

describe('managerLabel', () => {
  it('names the selection once a project is open', () => {
    expect(managerLabel(true, 'terminal 3 waiting', 'ctrl+o', 'open project')).toBe('terminal 3 waiting');
  });

  it('names the picker key when nothing is open', () => {
    expect(managerLabel(false, 'terminal 3 waiting', 'ctrl+o', 'open project')).toBe('ctrl+o · open project');
  });
});

describe('modeLabel', () => {
  it('reads the manager label on manager mode', () => {
    expect(modeLabel(page({ mode: 'manager', hasProjects: true, managerStatusLabel: 'row 1' }))).toBe('row 1');
    expect(modeLabel(page({
      mode: 'manager', hasProjects: false, pickerBinding: 'ctrl+o', pickerDescription: 'open project',
    }))).toBe('ctrl+o · open project');
  });

  it('names nvim on nvim mode', () => {
    expect(modeLabel(page({ mode: 'nvim' }))).toBe('nvim');
  });

  it('names the board and its label on board mode', () => {
    expect(modeLabel(page({ mode: 'board', boardLabel: 'Doing · high' }))).toBe('board · Doing · high');
  });

  it('lets the command screen name what the selection is on', () => {
    expect(modeLabel(page({ mode: 'command', commandStatusLabel: 'api · marked · exit 0' })))
      .toBe('api · marked · exit 0');
  });

  it('is empty when a project has no panes', () => {
    expect(modeLabel(page({ mode: 'terminals', paneCount: 0 }))).toBe('');
  });

  const worktrees = [{
    worktreePath: '/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves',
    branch: 'panes-name-themselves',
  }];

  it('names the focused pane plainly when it is on the project checkout', () => {
    expect(modeLabel(page({
      mode: 'terminals',
      focused: 0,
      worktrees,
      focusedDirectory: '/Users/sharp/workspace/personal/dashboard',
    }))).toBe('terminal 1');
  });

  it('names the branch when the focused pane is in a worktree', () => {
    expect(modeLabel(page({
      mode: 'terminals', focused: 2, worktrees, focusedDirectory: worktrees[0].worktreePath,
    }))).toBe('terminal 3 · panes-name-themselves');
  });

  // The shell an agent left behind is still in the branch's folder, and a second pane can be shipped
  // into the same worktree. Both say the branch, because both are in it.
  it('names the branch for every pane in the folder, not just the one a record holds', () => {
    expect(modeLabel(page({
      mode: 'terminals', focused: 4, worktrees, focusedDirectory: worktrees[0].worktreePath,
    }))).toBe('terminal 5 · panes-name-themselves');
  });
});

describe('terminalStatus', () => {
  it('is just the mode label when nothing is waiting', () => {
    expect(terminalStatus(page({ mode: 'nvim' }), [])).toBe('nvim');
  });

  it('appends the waiting names to the mode label', () => {
    expect(terminalStatus(page({ mode: 'nvim' }), ['terminal 2', 'terminal 4'])).toBe(
      'nvim · terminal 2, terminal 4 waiting',
    );
  });
});
