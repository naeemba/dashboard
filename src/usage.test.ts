import { describe, expect, it } from 'vitest';
import {
  FIVE_HOURS, formatTokens, paneTokens, projectTokens, ranInProject, retainFrom, snapshotOf,
  sumTotals, TOKEN_COLUMNS, tokensOf,
  totalsOf, usageDiffers, weekStart, type FileUsage,
} from './usage';

// Monday 14 September 2026, 09:00 local. It has to be a Monday: every weekStart and retainFrom
// expectation below is written against that boundary.
const MONDAY_MORNING = new Date(2026, 8, 14, 9, 0, 0).getTime();

function fileWith(samples: { at: number; tokens: number }[], allTime = 0): FileUsage {
  return { size: 0, directory: '/p', session: 's', allTime, samples };
}

describe('tokensOf', () => {
  it('counts all four counters, cache reads included', () => {
    expect(tokensOf({
      input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 4, cache_read_input_tokens: 8,
    })).toBe(15);
  });

  it('reads a line missing the newer counters as nought for them', () => {
    expect(tokensOf({ input_tokens: 3, output_tokens: 4 })).toBe(7);
  });
});

describe('weekStart', () => {
  it('is midnight on the Monday of that week', () => {
    expect(weekStart(MONDAY_MORNING)).toBe(new Date(2026, 8, 14, 0, 0, 0).getTime());
  });

  it('puts Sunday in the week that is ending, not the one about to start', () => {
    const sunday = new Date(2026, 8, 20, 23, 30, 0).getTime();
    expect(weekStart(sunday)).toBe(new Date(2026, 8, 14, 0, 0, 0).getTime());
  });
});

describe('retainFrom', () => {
  it('keeps the five-hour window when it reaches back past the Monday', () => {
    // Two in the morning on a Monday: the week is two hours old and the five-hour window is still
    // three hours inside Sunday night. Prune to the week and that work vanishes off both figures.
    const mondayNight = new Date(2026, 8, 14, 2, 0, 0).getTime();
    expect(retainFrom(mondayNight)).toBe(mondayNight - FIVE_HOURS);
  });

  it('keeps the whole week later in the week', () => {
    expect(retainFrom(MONDAY_MORNING + 3 * 24 * 60 * 60 * 1000)).toBe(weekStart(MONDAY_MORNING));
  });
});

describe('totalsOf', () => {
  it('sums each window and leaves all time alone', () => {
    const files = [fileWith([
      { at: MONDAY_MORNING - 60 * 1000, tokens: 10 },
      { at: MONDAY_MORNING - 6 * 60 * 60 * 1000, tokens: 100 },
    ], 5000)];
    // The six-hour-old sample is still this week — the week began nine hours ago — but outside the
    // five-hour window.
    expect(totalsOf(files, MONDAY_MORNING)).toEqual({ fiveHours: 10, week: 110, allTime: 5000 });
  });

  it('adds up across files, which is how a session and its subagents are counted together', () => {
    const files = [fileWith([{ at: MONDAY_MORNING, tokens: 1 }], 1), fileWith([{ at: MONDAY_MORNING, tokens: 2 }], 2)];
    expect(totalsOf(files, MONDAY_MORNING)).toEqual({ fiveHours: 3, week: 3, allTime: 3 });
  });

  it('leaves last week out of the week', () => {
    const files = [fileWith([{ at: MONDAY_MORNING - 8 * 24 * 60 * 60 * 1000, tokens: 99 }], 99)];
    expect(totalsOf(files, MONDAY_MORNING)).toEqual({ fiveHours: 0, week: 0, allTime: 99 });
  });
});

describe('ranInProject', () => {
  const project = '/Users/sharp/work/api';
  const worktrees = '/Users/sharp/work/api.worktrees';

  it('takes the checkout itself and anything under it', () => {
    expect(ranInProject(project, project, worktrees)).toBe(true);
    expect(ranInProject(`${project}/src`, project, worktrees)).toBe(true);
  });

  it('takes the worktrees beside it, which no prefix of the project would reach', () => {
    expect(ranInProject(`${worktrees}/fix-login`, project, worktrees)).toBe(true);
  });

  it('leaves out a sibling whose name only starts the same way', () => {
    expect(ranInProject('/Users/sharp/work/api-docs', project, worktrees)).toBe(false);
  });
});

describe('formatTokens', () => {
  it('counts small numbers out in full', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('drops a trailing nought rather than printing 2.0B', () => {
    expect(formatTokens(2e9)).toBe('2B');
    expect(formatTokens(12_400_000)).toBe('12.4M');
    expect(formatTokens(9_200)).toBe('9.2K');
  });
});

describe('what a figure worth nought prints', () => {
  it('prints nothing for a pane with no agent in it, rather than a nought', () => {
    expect(paneTokens(0)).toBe('');
    expect(paneTokens(9_200)).toBe('9.2K');
  });

  it('prints nothing for a project never worked on, rather than three noughts', () => {
    expect(projectTokens({ fiveHours: 0, week: 0, allTime: 0 })).toEqual(['', '', '']);
  });

  it('keeps a quiet week beside a busy history, since all time is what says it is worth a row', () => {
    expect(projectTokens({ fiveHours: 0, week: 0, allTime: 2e9 })).toEqual(['0', '0', '2B']);
  });

  // The row keeps its columns whatever it has to print in them, or a quiet project draws a row of a
  // different shape to the ones above it and the list stops being columns at all.
  it('gives a project as many figures as there are columns, spent on or not', () => {
    expect(projectTokens({ fiveHours: 0, week: 0, allTime: 0 })).toHaveLength(TOKEN_COLUMNS.length);
    expect(projectTokens({ fiveHours: 1, week: 2, allTime: 3 })).toHaveLength(TOKEN_COLUMNS.length);
  });
});

describe('sumTotals', () => {
  it('adds the three windows across every open project', () => {
    expect(sumTotals([
      { fiveHours: 1, week: 10, allTime: 100 },
      { fiveHours: 2, week: 20, allTime: 200 },
    ])).toEqual({ fiveHours: 3, week: 30, allTime: 300 });
  });

  // The foot of the page is drawn before the first sweep has run and on a window with nothing open,
  // so an empty list has to add up to noughts rather than to nothing at all.
  it('adds nothing up to noughts', () => {
    expect(sumTotals([])).toEqual({ fiveHours: 0, week: 0, allTime: 0 });
  });
});

describe('snapshotOf', () => {
  const project = '/Users/sharp/work/api';
  const worktrees = '/Users/sharp/work/api.worktrees';

  function fileIn(directory: string, session: string, tokens: number): FileUsage {
    return { size: 0, directory, session, allTime: tokens, samples: [{ at: MONDAY_MORNING, tokens }] };
  }

  it('counts the worktrees beside a project towards it, not only the checkout', () => {
    const files = [fileIn(project, 'a', 10), fileIn(`${worktrees}/fix-login`, 'b', 5)];
    const snapshot = snapshotOf(files, [{ path: project, worktrees }], new Map(), MONDAY_MORNING);
    expect(snapshot.projects[project]).toEqual({ fiveHours: 15, week: 15, allTime: 15 });
  });

  it('leaves a session that ran somewhere else out of the project', () => {
    const files = [fileIn('/Users/sharp/work/api-docs', 'a', 10)];
    const snapshot = snapshotOf(files, [{ path: project, worktrees }], new Map(), MONDAY_MORNING);
    expect(snapshot.projects[project]).toEqual({ fiveHours: 0, week: 0, allTime: 0 });
  });

  it("gives a pane its session's whole cost, the subagents' own files included", () => {
    const files = [fileIn(project, 'a', 10), fileIn(project, 'a', 7), fileIn(project, 'b', 99)];
    const snapshot = snapshotOf(
      files, [{ path: project, worktrees }], new Map([['0-1', 'a']]), MONDAY_MORNING,
    );
    expect(snapshot.panes).toEqual({ '0-1': 17 });
  });

  it('gives a pane whose session has written nothing yet a nought rather than nothing', () => {
    const snapshot = snapshotOf([], [], new Map([['0-1', 'a']]), MONDAY_MORNING);
    expect(snapshot.panes).toEqual({ '0-1': 0 });
  });
});

describe('usageDiffers', () => {
  const totals = { fiveHours: 1, week: 2, allTime: 3 };

  it('says no to a sweep that read the same figures back', () => {
    expect(usageDiffers(
      { projects: { '/p': totals }, panes: { '0-1': 5 } },
      { projects: { '/p': { ...totals } }, panes: { '0-1': 5 } },
    )).toBe(false);
  });

  it('says yes to a figure that moved, and to a pane that came or went', () => {
    expect(usageDiffers(
      { projects: { '/p': totals }, panes: {} },
      { projects: { '/p': { ...totals, fiveHours: 2 } }, panes: {} },
    )).toBe(true);
    expect(usageDiffers({ projects: {}, panes: {} }, { projects: {}, panes: { '0-1': 0 } })).toBe(true);
  });
});
