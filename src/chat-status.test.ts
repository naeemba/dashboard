import { describe, expect, it } from 'vitest';
import { clockTime, measureOf, statusGroups, toneOf, type ChatMeasure } from './chat-status';

const models = [
  { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)', description: '' },
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: '' },
  { value: 'claude-opus-4-8', resolvedModel: 'claude-opus-4-8', displayName: 'Opus 4.8', description: '' },
];
const context = { totalTokens: 70_400, maxTokens: 1_000_000, percentage: 7.4, model: 'claude-opus-4-8' };
const window = (utilization: number | null) => ({ utilization, resets_at: '2026-10-30T03:50:00Z' });

describe('measureOf', () => {
  it('names the model by the list and keeps only the limits that carry a number', () => {
    const measure = measureOf(context, models, { rate_limits: { five_hour: window(25), seven_day: window(null) } });
    expect(measure).toEqual({
      context: { percentage: 7.4, used: 70_400, size: 1_000_000 },
      model: 'Opus 4.8',
      fiveHour: { percentage: 25, resetsAt: '2026-10-30T03:50:00Z' },
      sevenDay: null,
    });
  });

  it('names the default model by its own row, not the default row that resolves to it', () => {
    expect(measureOf({ ...context, model: 'claude-opus-5-5' }, models, null).model).toBe('Opus 5.5');
  });

  it('shows a model the list lacks by its id, and no limits when the plan has none', () => {
    const measure = measureOf({ ...context, model: 'claude-x' }, models, null);
    expect([measure.model, measure.fiveHour, measure.sevenDay]).toEqual(['claude-x', null, null]);
  });
});

describe('statusGroups', () => {
  const text = (groups: ReturnType<typeof statusGroups>) => groups.map((group) => group.map((piece) => piece.text).join(' ')).join(' · ');
  const measure: ChatMeasure = {
    context: { percentage: 7.4, used: 70_400, size: 1_000_000 }, model: 'Opus 5.5',
    fiveHour: { percentage: 25.9, resetsAt: null }, sevenDay: { percentage: 89, resetsAt: null },
  };

  it('draws Claude Code\'s status line', () => {
    expect(text(statusGroups(measure, 'Opus 5.5', '2.1.312'))).toBe('7% · 70.4K/1M · 5h: 25% · 7d: 89% · Opus 5.5 · v2.1.312');
  });

  it('has only the model and version before the session is measured', () => {
    expect(text(statusGroups(null, 'default model', null))).toBe('default model');
  });

  it('colours each percentage and the model by family', () => {
    const groups = statusGroups(measure, 'Fable 5.1', null);
    expect(groups[3][1].tone).toBe('yellow');
    expect(groups.at(-1)?.[0].tone).toBe('red');
  });
});

describe('toneOf and clockTime', () => {
  it('turns yellow at 70 and red at 90', () => {
    expect([toneOf(69), toneOf(70), toneOf(89.9), toneOf(90)]).toEqual(['green', 'yellow', 'yellow', 'red']);
  });

  it('writes a reset time the way the terminal does, in local time', () => {
    expect(clockTime(new Date(2026, 9, 30, 7, 5).toISOString())).toBe('7:05am');
    expect(clockTime(new Date(2026, 9, 30, 0, 30).toISOString())).toBe('12:30am');
    expect(clockTime(new Date(2026, 9, 30, 15, 40).toISOString())).toBe('3:40pm');
    expect(clockTime('soon')).toBeNull();
  });
});
