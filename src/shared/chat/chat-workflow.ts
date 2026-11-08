import { isRecord, stringOrEmpty as text } from '../app/is-record';
import { heldIndex } from '../app/clamp-index';

// A running workflow's phases and agents, as its strip row and the workflow key's panel draw them.
// The session carries them on each task_progress about the workflow, as `workflow_progress`: a
// field the SDK's types leave out but the CLI bundled with Agent SDK 0.3.316 sends, the whole list each time,
// one `workflow_phase` entry per phase the script announced and one `workflow_agent` entry per agent
// run: the CLI keeps one slot per type and index and swaps each update into it, so an agent's latest
// state is its only entry. A progress message with only token ticks leaves the list out, so the last
// one stands until the next.

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

// `index` is the phase's own from the stream, -1 for the bucket of agents outside any phase.
export type WorkflowPhase = { index: number; title: string; agents: WorkflowAgent[] };

export type WorkflowProgress = { phases: WorkflowPhase[] };

export const NO_PROGRESS: WorkflowProgress = { phases: [] };

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
    agents.set(agent.index, { phase, agent });
  }
  const byPhase = new Map<number, WorkflowAgent[]>();
  for (const { phase, agent } of [...agents.values()].sort((a, b) => a.agent.index - b.agent.index)) {
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), agent]);
  }
  const order = [...titles.keys()].sort((a, b) => a - b);
  if (byPhase.has(-1)) order.push(-1);
  return {
    phases: order.map((phase) => ({
      index: phase,
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

// The workflow panel's rows: each phase by its index, then, while the workflow runs, the row that
// stops it.
export type WorkflowRow = number | 'stop';

export function workflowRows(progress: WorkflowProgress | null, live: boolean): WorkflowRow[] {
  return [...(progress?.phases ?? []).map((phase) => phase.index), ...(live ? ['stop' as const] : [])];
}

// Where the panel's selection lands once its rows were rebuilt: on the row it was on, wherever that
// moved. The stop row is held only when it was picked from among phases; selected because it was the
// only row, before any phase arrived, it gives way to the first phase, so Enter never stops a workflow
// nobody pointed at.
export function heldWorkflowRow(before: readonly WorkflowRow[], after: readonly WorkflowRow[], selected: number): number {
  const key = before.length === 1 && before[0] === 'stop' ? undefined : before[selected];
  return heldIndex(after, key, selected);
}

// What the open panel shows after the transcript changed, or null when nothing it shows did: the
// workflow as streamed now while it runs, the last one marked ended once it left the strip.
export function panelUpdate<Task>(shown: { task: Task; live: boolean }, now: Task | undefined): { task: Task; live: boolean } | null {
  if (now === shown.task || (!now && !shown.live)) return null;
  return now ? { task: now, live: shown.live } : { task: shown.task, live: false };
}
