import { describe, expect, it } from 'vitest';
import { clockTime, measureOf, modelTone, statusMeters, toneOf, workingLine, type ChatMeasure } from './chat-status';

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

describe('statusMeters', () => {
  const measure: ChatMeasure = {
    context: { percentage: 7.4, used: 70_400, size: 1_000_000 }, model: 'Opus 5.5',
    fiveHour: { percentage: 25.9, resetsAt: new Date(2026, 9, 30, 7, 19).toISOString() }, sevenDay: { percentage: 89, resetsAt: null },
  };

  it('carries the context and both plan limits, each with its colour and what else it says', () => {
    expect(statusMeters(measure)).toEqual([
      { label: 'context', percentage: 7.4, tone: 'green', detail: '70.4K / 1M' },
      { label: '5h', percentage: 25.9, tone: 'green', detail: 'resets 7:19am' },
      { label: '7d', percentage: 89, tone: 'yellow', detail: null },
    ]);
  });

  it('leaves out a limit the plan does not have', () => {
    expect(statusMeters({ ...measure, fiveHour: null, sevenDay: null }).map((each) => each.label)).toEqual(['context']);
  });
});

describe('workingLine', () => {
  it('counts the seconds and the tokens streamed, four characters to a token', () => {
    expect(workingLine(18, 1264, false)).toBe('Working… (18s · ↓ 316 tokens)');
  });

  it('says thinking while a thinking block streams, and no tokens before any came', () => {
    expect(workingLine(3, 0, true)).toBe('Thinking… (3s)');
  });

  it('names the hook running in place of what Claude is doing', () => {
    expect(workingLine(3, 0, true, 'PostToolUse:Edit')).toBe('Running PostToolUse:Edit hook… (3s)');
  });
});

describe('modelTone', () => {
  it('colours a model by its family', () => {
    expect([modelTone('Fable 5.1'), modelTone('Opus 5.5'), modelTone('claude-x')]).toEqual(['red', 'yellow', 'plain']);
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
