import { describe, expect, it } from 'vitest';
import type { Settings } from '../../shared/settings/settings';
import { AHEAD_ALLOWED_MS, budgetVerdict, paceDay, parseBudgetCommand, STALE_AFTER_MS } from './budget-cli';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const reading = (usedPercentage: unknown, at: number, resetsAt?: number) => JSON.stringify({
  usedPercentage, at: new Date(at).toISOString(), ...(resetsAt === undefined ? {} : { resetsAt: new Date(resetsAt).toISOString() }),
});
const cap = (weeklyCap: number | null): Settings['budget'] => ({ limit: 'cap', weeklyCap, dailyShare: null });
const pace = (dailyShare: number | null = null): Settings['budget'] => ({ limit: 'pace', weeklyCap: 25, dailyShare });

// Local times, so the calendar days the pace counts are the same in any time zone the tests run in.
const RESET = new Date(2026, 10, 27, 15, 30).getTime(); // Friday 15:30, when this window ends
const TUESDAY = new Date(2026, 10, 24, 11, 0).getTime();

describe('budgetVerdict', () => {
  it('is under below the cap and over at or above it', () => {
    expect(budgetVerdict(reading(64, NOW - 3 * 60_000), cap(74), NOW))
      .toMatchObject({ exitCode: 0, line: expect.stringMatching(/^64% of the 7-day usage used, weekly cap 74%, read .+: under the cap$/) });
    expect(budgetVerdict(reading(74, NOW), cap(74), NOW).exitCode).toBe(1);
    expect(budgetVerdict(reading(80.5, NOW), cap(74), NOW).exitCode).toBe(1);
  });

  it('cannot say with no cap, no file or a broken file', () => {
    expect(budgetVerdict(reading(10, NOW), cap(null), NOW).exitCode).toBe(2);
    expect(budgetVerdict(null, cap(74), NOW).exitCode).toBe(2);
    for (const broken of ['{', '[]', '{"usedPercentage":"64","at":"2026-11-16T12:00:00Z"}', '{"usedPercentage":64}', '{"usedPercentage":64,"at":"soon"}']) {
      expect(budgetVerdict(broken, cap(74), NOW).exitCode, broken).toBe(2);
    }
  });

  it('calls a stale reading unknown, never under', () => {
    expect(budgetVerdict(reading(10, NOW - STALE_AFTER_MS), cap(74), NOW).exitCode).toBe(0);
    const stale = budgetVerdict(reading(10, NOW - 7 * 24 * 3_600_000), cap(74), NOW);
    expect(stale.exitCode).toBe(2);
    expect(stale.line).toContain(': too old to say');
  });

  it('counts a reading from a clock a little ahead as fresh, and one far ahead as unknown', () => {
    expect(budgetVerdict(reading(10, NOW + AHEAD_ALLOWED_MS), cap(74), NOW).line).toContain('read just now');
    const ahead = budgetVerdict(reading(10, NOW + 3_600_000), cap(74), NOW);
    expect(ahead.exitCode).toBe(2);
    expect(ahead.line).toContain('dated in the future');
  });
});

describe('paceDay', () => {
  it('is day 1 from the reset until midnight, then a day for each calendar day begun', () => {
    const lastReset = RESET - 7 * 24 * 3_600_000;
    expect(paceDay(RESET, lastReset + 60_000)).toBe(1);
    expect(paceDay(RESET, new Date(2026, 10, 20, 23, 59).getTime())).toBe(1);
    expect(paceDay(RESET, new Date(2026, 10, 21, 0, 0).getTime())).toBe(2);
    expect(paceDay(RESET, TUESDAY)).toBe(5);
    expect(paceDay(RESET, RESET - 60_000)).toBe(7);
  });

  it('counts from a reset already past, the window that began then', () => {
    expect(paceDay(RESET, RESET + 60_000)).toBe(1);
  });
});

describe('the pace', () => {
  it('is a seventh of the week for each day begun, or the set daily share', () => {
    expect(budgetVerdict(reading(64, TUESDAY, RESET), pace(), TUESDAY)).toEqual({
      exitCode: 0, line: "64% of the 7-day usage used, today's cap 71.4% (pace, day 5 of 7 since the reset), read just now: under the cap",
    });
    expect(budgetVerdict(reading(72, TUESDAY, RESET), pace(), TUESDAY).exitCode).toBe(1);
    expect(budgetVerdict(reading(40, TUESDAY, RESET), pace(8), TUESDAY).exitCode).toBe(1);
    expect(budgetVerdict(reading(99, RESET - 60_000, RESET), pace(), RESET - 60_000).exitCode).toBe(0);
    expect(budgetVerdict(reading(99, RESET - 60_000, RESET), pace(30), RESET - 60_000).line).toContain("today's cap 100%");
  });

  it('cannot say without the reset time', () => {
    const unknown = budgetVerdict(reading(10, TUESDAY), pace(), TUESDAY);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.line).toContain('no reset time');
    expect(budgetVerdict(JSON.stringify({ usedPercentage: 10, at: new Date(TUESDAY).toISOString(), resetsAt: 'Friday' }), pace(), TUESDAY).exitCode).toBe(2);
  });
});

describe('no limit', () => {
  it('answers under whatever the reading, even none', () => {
    const none: Settings['budget'] = { limit: 'none', weeklyCap: 10, dailyShare: null };
    expect(budgetVerdict(null, none, NOW).exitCode).toBe(0);
    expect(budgetVerdict(reading(90, NOW), none, NOW).exitCode).toBe(0);
  });
});

describe('parseBudgetCommand', () => {
  it('reads with no words, sets a cap from --cap and a pace from --pace, the last of them winning', () => {
    expect(parseBudgetCommand([])).toEqual({ kind: 'read' });
    expect(parseBudgetCommand(['--pace', 'even'])).toEqual({ kind: 'pace', share: 'even' });
    expect(parseBudgetCommand(['--cap', 'none', '--pace=12'])).toEqual({ kind: 'pace', share: '12' });
    expect(parseBudgetCommand(['--cap', '74'])).toEqual({ kind: 'cap', cap: '74' });
    expect(parseBudgetCommand(['--cap=62.5'])).toEqual({ kind: 'cap', cap: '62.5' });
  });

  it('refuses --cap with no value, and any other word', () => {
    for (const words of [['--cap'], ['--pace'], ['now'], ['--project', 'crm']]) {
      expect(parseBudgetCommand(words).kind, words.join(' ')).toBe('refused');
    }
  });
});
