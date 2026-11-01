import type { ModelInfo, SDKControlGetContextUsageResponse, SDKControlGetUsageResponse } from '@anthropic-ai/claude-agent-sdk';
import { formatTokens } from '../usage/usage';

// The Claude screen's status line: what Claude Code's own status line shows under the prompt in a
// terminal — how full the context is, the plan's five-hour and seven-day limits, the model and the
// version — read from the running session after each turn.

type UsageWindow = { percentage: number; resetsAt: string | null };

export type ChatMeasure = {
  context: { percentage: number; used: number; size: number };
  // The model's shown name, "Opus 5.5", rather than the id the session runs it by. Null once a model
  // is picked, so the picked one shows until the next measure names it.
  model: string | null;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
};

export type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'plain';

type ContextUsage = Pick<SDKControlGetContextUsageResponse, 'totalTokens' | 'maxTokens' | 'percentage' | 'model'>;
type PlanUsage = Pick<SDKControlGetUsageResponse, 'rate_limits'> | null;
type PlanWindow = NonNullable<SDKControlGetUsageResponse['rate_limits']>['five_hour'];

function usageWindow(window: PlanWindow): UsageWindow | null {
  return typeof window?.utilization === 'number' ? { percentage: window.utilization, resetsAt: window.resets_at } : null;
}

// Whether a row of the session's model list is the model `id` names, by its alias or its full id. The
// "default" row carries the full id of whatever it resolves to, which another row also carries; it
// matches only by its own alias, so the model is named by its own row.
export function isModel(row: ModelInfo, id: string): boolean {
  return row.value === id || (row.value !== 'default' && row.resolvedModel === id);
}

// What the session's three answers say, put together. A model the list does not hold is shown by its id.
export function measureOf(context: ContextUsage, models: ModelInfo[], usage: PlanUsage): ChatMeasure {
  const named = models.find((model) => isModel(model, context.model));
  return {
    context: { percentage: context.percentage, used: context.totalTokens, size: context.maxTokens },
    model: named?.displayName ?? context.model,
    fiveHour: usageWindow(usage?.rate_limits?.five_hour),
    sevenDay: usageWindow(usage?.rate_limits?.seven_day),
  };
}

// Green until 70, yellow until 90, red after: the thresholds Claude Code's status line colours by.
export function toneOf(percentage: number): StatusTone {
  return percentage >= 90 ? 'red' : percentage >= 70 ? 'yellow' : 'green';
}

// A meter on the status line: how much of something is used, in the colour that amount takes, and
// what else is worth saying about it.
export type StatusMeter = { label: string; percentage: number; tone: StatusTone; detail: string | null };

// The context window and the plan's two limits, as Claude Code's status line orders them. The
// seven-day reset is days off and Claude Code leaves it out; only the five-hour one is said.
export function statusMeters(measure: ChatMeasure): StatusMeter[] {
  const meter = (label: string, percentage: number, detail: string | null): StatusMeter => ({ label, percentage, tone: toneOf(percentage), detail });
  const { percentage, used, size } = measure.context;
  const meters = [meter('context', percentage, `${formatTokens(used)} / ${formatTokens(size)}`)];
  const { fiveHour, sevenDay } = measure;
  if (fiveHour) {
    const reset = fiveHour.resetsAt ? clockTime(fiveHour.resetsAt) : null;
    meters.push(meter('5h', fiveHour.percentage, reset ? `resets ${reset}` : null));
  }
  if (sevenDay) meters.push(meter('7d', sevenDay.percentage, null));
  return meters;
}

// The working line under the conversation while a turn runs, as Claude Code draws it over its prompt:
// whether Claude is thinking, how long, and roughly how many tokens have come down. A token is taken
// as four characters, the estimate Claude Code itself shows while a response streams. A hook running
// is named instead, as Claude Code names it.
export function workingLine(seconds: number, streamed: number, thinking: boolean, hook: string | null = null): string {
  const parts = [`${seconds}s`];
  if (streamed > 0) parts.push(`↓ ${formatTokens(Math.round(streamed / 4))} tokens`);
  const doing = hook ? `Running ${hook} hook` : thinking ? 'Thinking' : 'Working';
  return `${doing}… (${parts.join(' · ')})`;
}

const MODEL_TONES: [string, StatusTone][] = [['fable', 'red'], ['opus', 'yellow'], ['sonnet', 'green'], ['haiku', 'blue']];

export function modelTone(name: string): StatusTone {
  return MODEL_TONES.find(([family]) => name.toLowerCase().includes(family))?.[1] ?? 'plain';
}

// "7:20am", in the machine's own time.
export function clockTime(when: string | number): string | null {
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return null;
  const hours = at.getHours();
  return `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`;
}
