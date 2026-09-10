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
    pickerBinding: '',
    pickerDescription: '',
    worktrees: [],
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

  it('is empty when a project has no panes', () => {
    expect(modeLabel(page({ mode: 'terminals', paneCount: 0 }))).toBe('');
  });

  it('names the focused pane plainly when it is on the project checkout', () => {
    const worktrees = [{ pane: 1, branch: 'panes-name-themselves' }];
    expect(modeLabel(page({ mode: 'terminals', focused: 0, worktrees }))).toBe('terminal 1');
  });

  it('names the branch when the focused pane is on a worktree', () => {
    const worktrees = [{ pane: 2, branch: 'panes-name-themselves' }];
    expect(modeLabel(page({ mode: 'terminals', focused: 2, worktrees }))).toBe(
      'terminal 3 · panes-name-themselves',
    );
  });

  it('never labels pane 0 with a worktree that has no pane', () => {
    const worktrees = [{ pane: null, branch: 'panes-name-themselves' }];
    expect(modeLabel(page({ mode: 'terminals', focused: 0, worktrees }))).toBe('terminal 1');
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
