import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import { formatTokens } from './usage';

// The Claude screen's status line: what Claude Code's own status line shows under the prompt in a
// terminal — how full the context is, the plan's five-hour and seven-day limits, the model and the
// version — read from the running session after each turn.

type UsageWindow = { percentage: number; resetsAt: string | null };

export type ChatMeasure = {
  context: { percentage: number; used: number; size: number };
  // The model's shown name, "Opus 5.5", rather than the id the session runs it by.
  model: string;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
};

export type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'muted' | 'plain';
type StatusPiece = { text: string; tone: StatusTone };

type ContextUsage = { totalTokens: number; maxTokens: number; percentage: number; model: string };
type PlanWindow = { utilization: number | null; resets_at: string | null } | null | undefined;
type PlanUsage = { rate_limits: { five_hour?: PlanWindow; seven_day?: PlanWindow } | null } | null;

function usageWindow(window: PlanWindow): UsageWindow | null {
  return typeof window?.utilization === 'number' ? { percentage: window.utilization, resetsAt: window.resets_at } : null;
}

// What the session's three answers say, put together. A model the list does not hold is shown by its id.
export function measureOf(context: ContextUsage, models: ModelInfo[], usage: PlanUsage): ChatMeasure {
  const named = models.find((model) => model.value === context.model || model.resolvedModel === context.model);
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

const MODEL_TONES: [string, StatusTone][] = [['fable', 'red'], ['opus', 'yellow'], ['sonnet', 'green'], ['haiku', 'blue']];

function modelTone(name: string): StatusTone {
  return MODEL_TONES.find(([family]) => name.toLowerCase().includes(family))?.[1] ?? 'plain';
}

// "7:20am", in the machine's own time.
export function clockTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const hours = at.getHours();
  return `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`;
}

// A plan limit: its label, with the time it resets when there is one, then how much is used.
function windowGroup(label: string, window: UsageWindow): StatusPiece[] {
  const reset = window.resetsAt ? clockTime(window.resetsAt) : null;
  return [
    { text: reset ? `${label} (${reset})` : label, tone: 'muted' },
    { text: `${Math.floor(window.percentage)}%`, tone: toneOf(window.percentage) },
  ];
}

// The line's groups, each one or more coloured pieces, in Claude Code's order. Before the session has
// been measured only the model and version are known; a picked model shows until the next measure.
export function statusGroups(measure: ChatMeasure | null, model: string, version: string | null): StatusPiece[][] {
  const groups: StatusPiece[][] = [];
  if (measure) {
    const { percentage, used, size } = measure.context;
    groups.push([{ text: `${Math.floor(percentage)}%`, tone: toneOf(percentage) }]);
    groups.push([{ text: `${formatTokens(used)}/${formatTokens(size)}`, tone: 'muted' }]);
    // The seven-day reset is days off and Claude Code leaves it out; only the five-hour one is shown.
    if (measure.fiveHour) groups.push(windowGroup('5h:', measure.fiveHour));
    if (measure.sevenDay) groups.push(windowGroup('7d:', { ...measure.sevenDay, resetsAt: null }));
  }
  groups.push([{ text: model, tone: modelTone(model) }]);
  if (version) groups.push([{ text: `v${version}`, tone: 'muted' }]);
  return groups;
}
