import { isRecord, stringOrEmpty as text } from '../app/is-record';

// A running workflow's phases and agents, as its strip row and the workflow key's panel draw them.
// The session carries them on each task_progress about the workflow, as `workflow_progress`: a
// field the SDK's types leave out but the CLI bundled with Agent SDK 0.3.316 sends, the whole list each time,
// one `workflow_phase` entry per phase the script announced and one `workflow_agent` entry per agent
// run (its queued entry and its running one are two entries with the same index). A progress
// message with only token ticks leaves the list out, so the last one stands until the next.

export type WorkflowAgentState = 'queued' | 'running' | 'done' | 'failed';

export type WorkflowAgent = {
  index: number;
  label: string;
  model: string;
  state: WorkflowAgentState;
  tokens: number;
  tools: number;
  seconds: number;
};

export type WorkflowPhase = { title: string; agents: WorkflowAgent[] };

export type WorkflowProgress = { phases: WorkflowPhase[] };

export const NO_PROGRESS: WorkflowProgress = { phases: [] };

const RANK: Record<WorkflowAgentState, number> = { queued: 0, running: 1, done: 2, failed: 2 };

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function agentState(entry: Record<string, unknown>): WorkflowAgentState {
  if (entry.state === 'done') return 'done';
  if (entry.state === 'error') return 'failed';
  return typeof entry.startedAt === 'number' ? 'running' : 'queued';
}

function agentOf(entry: Record<string, unknown>): WorkflowAgent {
  const started = number(entry.startedAt);
  const last = number(entry.lastProgressAt);
  return {
    index: number(entry.index),
    label: text(entry.label) || `agent ${number(entry.index)}`,
    model: text(entry.model),
    state: agentState(entry),
    tokens: number(entry.tokens),
    tools: number(entry.toolCalls),
    seconds: started > 0 && last > started ? Math.round((last - started) / 1000) : 0,
  };
}

// The progress a task_progress carries, or null when it carries none.
export function workflowProgress(entries: unknown): WorkflowProgress | null {
  if (!Array.isArray(entries)) return null;
  const titles = new Map<number, string>();
  const agents = new Map<number, { phase: number; agent: WorkflowAgent }>();
  for (const entry of entries.filter(isRecord)) {
    if (entry.type === 'workflow_phase') titles.set(number(entry.index), text(entry.title));
    if (entry.type !== 'workflow_agent') continue;
    const agent = agentOf(entry);
    const phase = typeof entry.phaseIndex === 'number' ? entry.phaseIndex : -1;
    if (phase !== -1 && !titles.has(phase)) titles.set(phase, text(entry.phaseTitle));
    // An agent's furthest entry wins: its queued one stays in the list beside its running one.
    const known = agents.get(agent.index);
    if (!known || RANK[agent.state] >= RANK[known.agent.state]) agents.set(agent.index, { phase, agent });
  }
  const byPhase = new Map<number, WorkflowAgent[]>();
  for (const { phase, agent } of [...agents.values()].sort((a, b) => a.agent.index - b.agent.index)) {
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), agent]);
  }
  const order = [...titles.keys()].sort((a, b) => a - b);
  if (byPhase.has(-1)) order.push(-1);
  return {
    phases: order.map((phase) => ({
      title: phase === -1 ? 'Agents' : titles.get(phase) || `Phase ${phase + 1}`,
      agents: byPhase.get(phase) ?? [],
    })),
  };
}

const ended = (agent: WorkflowAgent): boolean => agent.state === 'done' || agent.state === 'failed';

// Agents ended of the agents started, over the whole workflow or one phase.
export function agentCount(phases: readonly WorkflowPhase[]): { done: number; total: number } {
  const all = phases.flatMap((phase) => phase.agents);
  return { done: all.filter(ended).length, total: all.length };
}

export type PhaseMark = 'done' | 'running' | 'waiting';

// A phase is done once it has agents and every one has ended, running while one has not.
export function phaseMark(phase: WorkflowPhase): PhaseMark {
  if (phase.agents.some((agent) => !ended(agent))) return 'running';
  return phase.agents.length > 0 ? 'done' : 'waiting';
}

const BAR_CELLS = 10;

// The strip row's bar and count, `▰▰▰▱▱▱▱▱▱▱ 3/10 agents`; null with no agent started yet.
export function workflowBar(progress: WorkflowProgress): string | null {
  const { done, total } = agentCount(progress.phases);
  if (total === 0) return null;
  const filled = Math.round((done / total) * BAR_CELLS);
  return `${'▰'.repeat(filled)}${'▱'.repeat(BAR_CELLS - filled)} ${done}/${total} ${total === 1 ? 'agent' : 'agents'}`;
}
