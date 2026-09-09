import { describe, expect, it } from 'vitest';
import {
  NOTHING_SELECTED, alertSummary, canOpen, isProjectPage, landingPosition, lineKey, managerLines,
  managerRows, nextSelection, projectPosition, selectedLine, tailLines, takesAnswer,
  type PaneAlert,
} from './manager';
import type { Bell } from './waiting';

describe('isProjectPage', () => {
  it('says the manager is not one, so it never moves and is never saved', () => {
    expect(isProjectPage({ mode: 'manager' })).toBe(false);
  });

  it('says every view a project can show is one', () => {
    expect(isProjectPage({ mode: 'terminals' })).toBe(true);
    expect(isProjectPage({ mode: 'nvim' })).toBe(true);
    expect(isProjectPage({ mode: 'board' })).toBe(true);
  });
});

describe('projectPosition', () => {
  it('never lands a project in front of the manager', () => {
    expect(projectPosition(0)).toBe(1);
  });

  it('leaves every position behind the manager alone', () => {
    expect(projectPosition(1)).toBe(1);
    expect(projectPosition(4)).toBe(4);
  });
});

describe('landingPosition', () => {
  it('opens on the project the last run was left on', () => {
    expect(landingPosition(3, 1)).toBe(3);
  });

  it('falls to the first project when the one it was left on is gone', () => {
    expect(landingPosition(-1, 2)).toBe(2);
  });

  it('lands on the manager only when no project survived', () => {
    expect(landingPosition(-1, -1)).toBe(0);
  });
});

describe('managerRows', () => {
  const page = (
    name: string, slot: number,
    panes: { name: string; bell: Bell; exited: boolean; tail(): string[] }[],
  ) => ({ project: { name }, slot, panes });
  const pane = (name: string, bell: Bell = 'quiet', exited = false, tail: string[] = []) => (
    { name, bell, exited, tail: () => tail }
  );

  it('gives a project one row, whatever its panes are doing', () => {
    const rows = managerRows([page('api', 3, [pane('terminal 1'), pane('terminal 2')])]);
    expect(rows).toEqual([{ slot: 3, name: 'api', alerts: [] }]);
  });

  it('names the panes that are asking and the panes that have died', () => {
    const rows = managerRows([page('api', 0, [
      pane('terminal 1'),
      pane('terminal 2', 'waiting'),
      pane('terminal 3', 'quiet', true),
      pane('nvim', 'notified'),
    ])]);
    expect(rows[0].alerts).toEqual([
      { index: 1, name: 'terminal 2', state: 'waiting', tail: [] },
      { index: 2, name: 'terminal 3', state: 'exited', tail: [] },
      { index: 3, name: 'nvim', state: 'waiting', tail: [] },
    ]);
  });

  it('calls a pane that died while it was asking dead, since restarting it is what it needs', () => {
    const rows = managerRows([page('api', 0, [pane('terminal 1', 'waiting', true)])]);
    expect(rows[0].alerts).toEqual([{ index: 0, name: 'terminal 1', state: 'exited', tail: [] }]);
  });

  it('keeps a project with no panes at all, so a dead project still has a row', () => {
    expect(managerRows([page('gone', 2, [])])).toEqual([{ slot: 2, name: 'gone', alerts: [] }]);
  });
});

describe('alertSummary', () => {
  const alert = (state: 'waiting' | 'exited') => ({ index: 0, name: 'terminal 1', state, tail: [] });

  it('says so when nothing on the project wants anything', () => {
    expect(alertSummary([])).toBe('quiet');
  });

  it('counts each kind, asking first', () => {
    expect(alertSummary([alert('exited'), alert('waiting'), alert('waiting')]))
      .toBe('2 waiting · 1 exited');
  });

  it('leaves out the kind that has none', () => {
    expect(alertSummary([alert('exited')])).toBe('1 exited');
  });
});

describe('managerLines', () => {
  const row = (slot: number, name: string, alerts: PaneAlert[] = []) => ({ slot, name, alerts });
  const alert = { index: 1, name: 'terminal 2', state: 'waiting' as const, tail: [] };

  it('lists the projects and nothing else while every row is shut', () => {
    const lines = managerLines([row(0, 'api', [alert]), row(1, 'web')], new Set());
    expect(lines).toEqual([
      { kind: 'project', row: row(0, 'api', [alert]), open: false },
      { kind: 'project', row: row(1, 'web'), open: false },
    ]);
  });

  it('puts an open project’s panes under it', () => {
    const lines = managerLines([row(0, 'api', [alert]), row(1, 'web')], new Set([0]));
    expect(lines).toEqual([
      { kind: 'project', row: row(0, 'api', [alert]), open: true },
      { kind: 'pane', slot: 0, alert },
      { kind: 'project', row: row(1, 'web'), open: false },
    ]);
  });

  it('shows a quiet project as shut however it was left, since it has nothing to show', () => {
    const lines = managerLines([row(1, 'web')], new Set([1]));
    expect(lines).toEqual([{ kind: 'project', row: row(1, 'web'), open: false }]);
  });
});

describe('lineKey', () => {
  const row = { slot: 2, name: 'api', alerts: [] };

  it('tells a project from the panes under it', () => {
    expect(lineKey({ kind: 'project', row, open: false })).toBe('2');
    const alert = { index: 0, name: 'terminal 1', state: 'waiting' as const, tail: [] };
    expect(lineKey({ kind: 'pane', slot: 2, alert })).toBe('2:0');
  });
});

describe('selectedLine', () => {
  const alert = { index: 1, name: 'terminal 2', state: 'waiting' as const, tail: [] };
  const lines = managerLines([{ slot: 0, name: 'api', alerts: [alert] }], new Set([0]));

  it('follows the line it was on when a row appears above it', () => {
    expect(selectedLine(lines, '0:1', 0)).toBe(1);
  });

  it('stays where it was when the line it was on has gone', () => {
    expect(selectedLine(lines, '9:9', 1)).toBe(1);
  });

  it('never points past the end after the lines it was on disappear', () => {
    expect(selectedLine([], '9:9', 4)).toBe(0);
  });

  // Answering a pane leaves nothing selected, and the redraw that follows must not pick a row: the
  // row under the old highlight now belongs to another project.
  it('keeps nothing selected once a pane has been answered', () => {
    expect(selectedLine(lines, '', -1)).toBe(-1);
  });
});

describe('nextSelection', () => {
  it('walks the list and stops at either end rather than wrapping', () => {
    expect(nextSelection(1, 0, 'down', 4)).toBe(2);
    expect(nextSelection(1, 0, 'up', 4)).toBe(0);
    expect(nextSelection(3, 0, 'down', 4)).toBe(3);
    expect(nextSelection(0, 0, 'up', 4)).toBe(0);
  });

  // Answering the pane on line 2 takes that row out, so line 2 is now the row that was under it.
  it('carries on from the row that was answered, not from the top of the list', () => {
    expect(nextSelection(NOTHING_SELECTED, 2, 'down', 4)).toBe(2);
    expect(nextSelection(NOTHING_SELECTED, 2, 'up', 4)).toBe(1);
  });

  // The bug this replaced: from an empty selection both arrows floored at zero, so answering a pane
  // near the bottom sent you back to the first project.
  it('does not send you to the first project after answering the last pane', () => {
    expect(nextSelection(NOTHING_SELECTED, 5, 'up', 5)).toBe(4);
  });
});

describe('canOpen', () => {
  it('refuses a project with nothing to list, so no row wears a marker over nothing', () => {
    expect(canOpen({ slot: 0, name: 'api', alerts: [] })).toBe(false);
    const alert = { index: 0, name: 'terminal 1', state: 'exited' as const, tail: [] };
    expect(canOpen({ slot: 0, name: 'api', alerts: [alert] })).toBe(true);
  });
});

describe('tailLines', () => {
  it('takes the last few lines and leaves the rest of the screen behind', () => {
    const screen = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    expect(tailLines(screen)).toEqual(['three', 'four', 'five', 'six', 'seven']);
  });

  // The blank lines a menu is spaced out with are what would push the question off the top.
  it('drops the blank ones rather than counting them, so the whole question survives', () => {
    const screen = [
      'noise', '', 'Allow this?', '', '1. Yes', '   ', '2. No', '', '3. No, and tell it why', '', '',
    ];
    expect(tailLines(screen))
      .toEqual(['noise', 'Allow this?', '1. Yes', '2. No', '3. No, and tell it why']);
  });

  it('gives back what there is when the pane has printed less than that', () => {
    expect(tailLines(['$ ', ''])).toEqual(['$ ']);
    expect(tailLines([])).toEqual([]);
  });
});

describe('takesAnswer', () => {
  const alert = (state: 'waiting' | 'exited') => ({ index: 0, name: 'terminal 1', state, tail: [] });

  it('sends a keystroke to a pane that is asking', () => {
    expect(takesAnswer(alert('waiting'))).toBe(true);
  });

  it('refuses a pane that has died, which needs Enter in the pane rather than an answer', () => {
    expect(takesAnswer(alert('exited'))).toBe(false);
  });
});
