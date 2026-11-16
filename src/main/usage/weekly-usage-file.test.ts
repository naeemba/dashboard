import { describe, expect, it } from 'vitest';
import { budgetVerdict } from '../command/budget-cli';
import { RECORD_EVERY_MS, weeklyUsageText } from './weekly-usage-file';

describe('weeklyUsageText', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');

  it('writes the shape budget reads, and budget reads it back', () => {
    const text = weeklyUsageText(42, null, now);
    expect(text).not.toBeNull();
    expect(budgetVerdict(text, 50, now)).toMatchObject({ exitCode: 0 });
  });

  it('waits a minute between writes', () => {
    expect(weeklyUsageText(42, now - RECORD_EVERY_MS + 1, now)).toBeNull();
    expect(weeklyUsageText(42, now - RECORD_EVERY_MS, now)).not.toBeNull();
  });

  it('writes nothing when the session gave no 7-day figure', () => {
    expect(weeklyUsageText(undefined, null, now)).toBeNull();
    expect(weeklyUsageText(Number.NaN, null, now)).toBeNull();
  });
});
