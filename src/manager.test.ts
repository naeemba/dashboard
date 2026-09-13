import { describe, expect, it } from 'vitest';
import {
  MANAGER_SLOT, alertSummary, canOpen, isAlerting, isProjectPage, landingPosition, lineKey,
  managerLines, managerRows, paneAge, projectPosition, tailLines, takesAnswer, type PaneSummary,
} from './manager';
import type { Bell } from './waiting';

// The rows carry `tail` as a function, so it is called before a row is compared with one written out.
const drawn = (panes: readonly PaneSummary[]) => panes.map((pane) => ({ ...pane, tail: pane.tail() }));

const summary = (state: PaneSummary['state'], tail: string[] = []): PaneSummary => (
  { index: 0, name: 'terminal 1', state, lastPrintedAt: 0, tail: () => tail }
);

describe('isProjectPage', () => {
  it('says the manager is not one, so it never moves and is never saved', () => {
    expect(isProjectPage({ slot: MANAGER_SLOT })).toBe(false);
  });

  it('says every project is one, whatever slot it was handed', () => {
    expect(isProjectPage({ slot: 0 })).toBe(true);
    expect(isProjectPage({ slot: 4 })).toBe(true);
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
    panes: { name: string; bell: Bell; exited: boolean; lastPrintedAt: number; tail(): string[] }[],
  ) => ({ project: { name }, slot, panes });
  const pane = (
    name: string, bell: Bell = 'quiet', exited = false, tail: string[] = [], lastPrintedAt = 0,
  ) => ({ name, bell, exited, lastPrintedAt, tail: () => tail });

  it('gives a project one row with every pane on it, whatever they are doing', () => {
    const rows = managerRows([page('api', 3, [pane('terminal 1'), pane('terminal 2')])]);
    expect(rows.map((row) => ({ slot: row.slot, name: row.name }))).toEqual([{ slot: 3, name: 'api' }]);
    expect(drawn(rows[0].panes)).toEqual([
      { index: 0, name: 'terminal 1', state: 'quiet', tail: [], lastPrintedAt: 0 },
      { index: 1, name: 'terminal 2', state: 'quiet', tail: [], lastPrintedAt: 0 },
    ]);
  });

  it('names the panes that are asking and the panes that have died', () => {
    const rows = managerRows([page('api', 0, [
      pane('terminal 1'),
      pane('terminal 2', 'waiting'),
      pane('terminal 3', 'quiet', true),
      pane('nvim', 'notified'),
    ])]);
    expect(rows[0].panes.map((entry) => entry.state)).toEqual([
      'quiet', 'waiting', 'exited', 'waiting',
    ]);
  });

  it('carries what each pane printed and when, so the row can say how long ago', () => {
    const rows = managerRows([page('api', 0, [pane('terminal 1', 'quiet', false, ['ok'], 1_000)])]);
    expect(drawn(rows[0].panes)).toEqual([
      { index: 0, name: 'terminal 1', state: 'quiet', tail: ['ok'], lastPrintedAt: 1_000 },
    ]);
  });

  // A project nobody has opened draws none of its panes, and reading a live terminal for a row that is
  // not on screen is thirty screens laid out on every keystroke to print none of them.
  it('does not read a pane’s screen until the row is drawn', () => {
    let reads = 0;
    const counted = {
      name: 'terminal 1',
      bell: 'quiet' as Bell,
      exited: false,
      lastPrintedAt: 0,
      tail: () => {
        reads += 1;
        return [];
      },
    };
    const rows = managerRows([page('api', 0, [counted])]);
    expect(reads).toBe(0);
    rows[0].panes[0].tail();
    expect(reads).toBe(1);
  });

  it('calls a pane that died while it was asking dead, since restarting it is what it needs', () => {
    const rows = managerRows([page('api', 0, [pane('terminal 1', 'waiting', true)])]);
    expect(rows[0].panes[0].state).toBe('exited');
  });

  it('keeps a project with no panes at all, so a dead project still has a row', () => {
    expect(managerRows([page('gone', 2, [])])).toEqual([{ slot: 2, name: 'gone', panes: [] }]);
  });
});

describe('paneAge', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z');

  it('says how long ago the pane last printed', () => {
    expect(paneAge(now - 41 * 60 * 1000, now)).toBe('41 minutes ago');
  });

  // A shell that has not drawn its prompt yet. The epoch would read as quiet since 1970.
  it('says nothing about a pane that has printed nothing', () => {
    expect(paneAge(0, now)).toBe('');
  });
});

describe('alertSummary', () => {
  const pane = summary;

  it('says so when nothing on the project wants anything', () => {
    expect(alertSummary([])).toBe('quiet');
  });

  // The five shells are five whatever they are doing, so counting them says nothing.
  it('says quiet for a project whose panes are all getting on with it', () => {
    expect(alertSummary([pane('quiet'), pane('quiet')])).toBe('quiet');
  });

  it('counts each kind, asking first', () => {
    expect(alertSummary([pane('exited'), pane('quiet'), pane('waiting'), pane('waiting')]))
      .toBe('2 waiting · 1 exited');
  });

  it('leaves out the kind that has none', () => {
    expect(alertSummary([pane('exited')])).toBe('1 exited');
  });
});

describe('managerLines', () => {
  const row = (slot: number, name: string, panes: PaneSummary[] = []) => ({ slot, name, panes });
  const pane = { ...summary('waiting'), index: 1, name: 'terminal 2' };

  it('lists the projects and nothing else while every row is shut', () => {
    const lines = managerLines([row(0, 'api', [pane]), row(1, 'web')], new Set());
    expect(lines).toEqual([
      { kind: 'project', row: row(0, 'api', [pane]), open: false },
      { kind: 'project', row: row(1, 'web'), open: false },
    ]);
  });

  it('puts an open project’s panes under it', () => {
    const lines = managerLines([row(0, 'api', [pane]), row(1, 'web')], new Set([0]));
    expect(lines).toEqual([
      { kind: 'project', row: row(0, 'api', [pane]), open: true },
      { kind: 'pane', slot: 0, pane },
      { kind: 'project', row: row(1, 'web'), open: false },
    ]);
  });

  it('shows a project with no panes as shut however it was left, since it has nothing to show', () => {
    const lines = managerLines([row(1, 'web')], new Set([1]));
    expect(lines).toEqual([{ kind: 'project', row: row(1, 'web'), open: false }]);
  });
});

describe('lineKey', () => {
  const row = { slot: 2, name: 'api', panes: [] };

  it('tells a project from the panes under it', () => {
    expect(lineKey({ kind: 'project', row, open: false })).toBe('2');
    expect(lineKey({ kind: 'pane', slot: 2, pane: summary('waiting') })).toBe('2:0');
  });
});

describe('canOpen', () => {
  it('refuses a project with nothing to list, so no row wears a marker over nothing', () => {
    expect(canOpen({ slot: 0, name: 'api', panes: [] })).toBe(false);
    expect(canOpen({ slot: 0, name: 'api', panes: [summary('quiet')] })).toBe(true);
  });
});

describe('isAlerting', () => {
  it('says a pane asking or dead wants something, and a pane at work does not', () => {
    expect(isAlerting(summary('waiting'))).toBe(true);
    expect(isAlerting(summary('exited'))).toBe(true);
    expect(isAlerting(summary('quiet'))).toBe(false);
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
  const pane = summary;

  it('sends a keystroke to a pane that is asking', () => {
    expect(takesAnswer(pane('waiting'))).toBe(true);
  });

  it('refuses a pane that has died, which needs Enter in the pane rather than an answer', () => {
    expect(takesAnswer(pane('exited'))).toBe(false);
  });

  // A pane getting on with its work is on the list now. A character typed at it would land in the
  // middle of whatever it is running, from a page that was not showing you what it is running.
  it('refuses a pane that is not asking anything', () => {
    expect(takesAnswer(pane('quiet'))).toBe(false);
  });
});
