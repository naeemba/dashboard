import { describe, expect, it } from 'vitest';
import {
  FIVE_HOURS, formatTokens, paneTokens, projectTokens, ranInProject, retainFrom, tokensOf, totalsOf,
  weekStart, type FileUsage,
} from './usage';

// Monday 15 September 2026, 09:00 local.
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
    expect(projectTokens({ fiveHours: 0, week: 0, allTime: 0 })).toBe('');
  });

  it('keeps a quiet week beside a busy history, since all time is what says it is worth a row', () => {
    expect(projectTokens({ fiveHours: 0, week: 0, allTime: 2e9 })).toBe('0  0  2B');
  });
});
