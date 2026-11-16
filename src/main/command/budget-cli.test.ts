import { describe, expect, it } from 'vitest';
import { budgetVerdict, parseBudgetCommand, STALE_AFTER_MS } from './budget-cli';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const reading = (usedPercentage: unknown, at: number) => JSON.stringify({ usedPercentage, at: new Date(at).toISOString() });

describe('budgetVerdict', () => {
  it('is under below the cap and over at or above it', () => {
    expect(budgetVerdict(reading(64, NOW - 3 * 60_000), 74, NOW))
      .toEqual({ exitCode: 0, line: '64% of the 7-day usage used, cap 74%, read 3 minutes ago: under the cap' });
    expect(budgetVerdict(reading(74, NOW), 74, NOW).exitCode).toBe(1);
    expect(budgetVerdict(reading(80.5, NOW), 74, NOW).exitCode).toBe(1);
  });

  it('cannot say with no cap, no file or a broken file', () => {
    expect(budgetVerdict(reading(10, NOW), null, NOW).exitCode).toBe(2);
    expect(budgetVerdict(null, 74, NOW).exitCode).toBe(2);
    for (const broken of ['{', '[]', '{"usedPercentage":"64","at":"2026-11-16T12:00:00Z"}', '{"usedPercentage":64}', '{"usedPercentage":64,"at":"soon"}']) {
      expect(budgetVerdict(broken, 74, NOW).exitCode, broken).toBe(2);
    }
  });

  it('calls a stale reading unknown, never under', () => {
    expect(budgetVerdict(reading(10, NOW - STALE_AFTER_MS), 74, NOW).exitCode).toBe(0);
    const stale = budgetVerdict(reading(10, NOW - 7 * 24 * 3_600_000), 74, NOW);
    expect(stale.exitCode).toBe(2);
    expect(stale.line).toContain('read 7 days ago: too old to say');
  });

  it('counts a reading from a clock ahead as fresh', () => {
    expect(budgetVerdict(reading(10, NOW + 60_000), 74, NOW).line).toContain('read just now');
  });
});

describe('parseBudgetCommand', () => {
  it('reads with no words, and sets a cap from --cap', () => {
    expect(parseBudgetCommand([])).toEqual({ kind: 'read' });
    expect(parseBudgetCommand(['--cap', '74'])).toEqual({ kind: 'cap', cap: 74 });
    expect(parseBudgetCommand(['--cap=62.5'])).toEqual({ kind: 'cap', cap: 62.5 });
  });

  it('refuses a cap outside above 0 to 100, and any other word', () => {
    for (const words of [['--cap', '0'], ['--cap', '101'], ['--cap', 'lots'], ['--cap'], ['now'], ['--project', 'crm']]) {
      expect(parseBudgetCommand(words).kind, words.join(' ')).toBe('refused');
    }
  });
});
