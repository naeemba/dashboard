import { describe, expect, it } from 'vitest';
import { budgetVerdict } from '../command/budget-cli';
import { RECORD_EVERY_MS, weeklyUsageText } from './weekly-usage-file';

describe('weeklyUsageText', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');

  const week = (percentage: number, resetsAt: string | null = null) => ({ percentage, resetsAt });

  it('writes the shape budget reads, and budget reads it back', () => {
    const text = weeklyUsageText(week(42), null, now);
    expect(text).not.toBeNull();
    expect(budgetVerdict(() => text, { limit: 'cap', weeklyCap: 50, dailyShare: null }, now)).toMatchObject({ exitCode: 0 });
  });

  it('writes the reset time the pace counts from, when the session gave one', () => {
    const pace = { limit: 'pace', weeklyCap: null, dailyShare: null } as const;
    expect(budgetVerdict(() => weeklyUsageText(week(42, '2026-11-20T15:30:00+00:00'), null, now), pace, now).exitCode).toBe(0);
    expect(budgetVerdict(() => weeklyUsageText(week(42, 'soon'), null, now), pace, now).exitCode).toBe(2);
  });

  it('waits a minute between writes', () => {
    expect(weeklyUsageText(week(42), now - RECORD_EVERY_MS + 1, now)).toBeNull();
    expect(weeklyUsageText(week(42), now - RECORD_EVERY_MS, now)).not.toBeNull();
  });

  it('writes nothing when the session gave no 7-day figure', () => {
    expect(weeklyUsageText(null, null, now)).toBeNull();
    expect(weeklyUsageText(week(Number.NaN), null, now)).toBeNull();
  });
});
