import { isRecord, stringOrEmpty as text } from '../app/is-record';
import { formatTokens } from '../usage/usage';
import { NO_PROGRESS, workflowBar, workflowProgress, type WorkflowProgress } from './chat-workflow';

// The agents, workflows and background commands Claude has running, as the strip over the box lists
// them. The session streams them as system messages — task_started, task_progress, task_updated,
// task_notification, and background_tasks_changed with the whole set of background ones — and only
// while it runs: a saved session keeps none, so a reopened one shows its tasks from the next change.

export type ChatTask = {
  id: string;
  description: string;
  // An agent's type, "general-purpose" or a custom agent's name; a workflow's name; or the kind of task.
  kind: string;
  // The task that started it, or null for one the main thread started.
  parent: string | null;
  backgrounded: boolean;
  // The tool call that started it, which backgrounding one task names; null when the session gave none.
  toolUseId: string | null;
  // An agent, whose own conversation the agents key opens; a workflow or background command has none.
  agent: boolean;
  // A background shell command or a Monitor, the only kinds whose output get_task_output reads.
  output: boolean;
  tools: number;
  tokens: number;
  seconds: number;
  lastTool: string | null;
  summary: string | null;
  // A workflow's phases and agents (chat-workflow.ts), or null for a task that is not a workflow.
  workflow: WorkflowProgress | null;
};

export type ChatTasks = readonly ChatTask[];

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);

const NO_USAGE: AgentUsage = { tools: 0, tokens: 0, seconds: 0 };

// The count a task_progress or task_notification carries, or null when it carries none. A count it
// leaves out is the one in `known`, the task's own so far.
export function messageUsage(message: Record<string, unknown>, known: AgentUsage = NO_USAGE): AgentUsage | null {
  const usage = isRecord(message.usage) ? message.usage : null;
  if (!usage || typeof usage.total_tokens !== 'number') return null;
  const seconds = typeof usage.duration_ms === 'number' ? Math.round(usage.duration_ms / 1000) : known.seconds;
  const tools = typeof usage.tool_uses === 'number' ? usage.tool_uses : known.tools;
  return { tools, tokens: usage.total_tokens, seconds };
}

const isAgent = (message: Record<string, unknown>): boolean => message.task_type === 'local_agent' || text(message.subagent_type) !== '';

const hasOutput = (message: Record<string, unknown>): boolean => message.task_type === 'local_bash' || message.task_type === 'monitor_mcp';

// background_tasks_changed and task_started both name a workflow's task_type `local_workflow`.
const workflowOf = (message: Record<string, unknown>): WorkflowProgress | null => (message.task_type === 'local_workflow' ? NO_PROGRESS : null);

// A task the strip leaves out: Claude Code's own housekeeping, which it marks as not being activity.
function quiet(message: Record<string, unknown>): boolean {
  return message.ambient === true || message.skip_transcript === true;
}

function kindOf(message: Record<string, unknown>): string {
  return text(message.subagent_type) || text(message.workflow_name) || text(message.task_type).replace(/_/g, ' ') || 'task';
}

// A later message about a listed task fills in what it names. A task started in the background joins
// background_tasks_changed before its task_started, so the row first carries only the task_type, and
// the task_started's workflow or agent name, or a new parent, has to reach it afterwards.
function merged(task: ChatTask, message: Record<string, unknown>): ChatTask {
  const description = text(message.description) || task.description;
  const kind = text(message.subagent_type) || text(message.workflow_name) || task.kind;
  const parent = text(message.parent_task_id) || task.parent;
  const agent = task.agent || isAgent(message);
  const output = task.output || hasOutput(message);
  const workflow = task.workflow ?? workflowOf(message);
  if (description === task.description && kind === task.kind && parent === task.parent && agent === task.agent && output === task.output && workflow === task.workflow) return task;
  return { ...task, description, kind, parent, agent, output, workflow };
}

function started(tasks: ChatTasks, message: Record<string, unknown>): ChatTasks {
  const id = text(message.task_id);
  if (!id || quiet(message)) return tasks;
  if (tasks.some((task) => task.id === id)) {
    const next = tasks.map((task) => (task.id === id ? merged(task, message) : task));
    return next.every((task, index) => task === tasks[index]) ? tasks : next;
  }
  return [...tasks, {
    id, description: text(message.description), kind: kindOf(message), parent: text(message.parent_task_id) || null,
    backgrounded: message.is_backgrounded === true, toolUseId: text(message.tool_use_id) || null, agent: isAgent(message), output: hasOutput(message), tools: 0, tokens: 0, seconds: 0, lastTool: null, summary: null,
    workflow: workflowOf(message),
  }];
}

function progressed(tasks: ChatTasks, message: Record<string, unknown>): ChatTasks {
  return tasks.map((task) => (task.id !== message.task_id ? task : {
    ...task,
    ...messageUsage(message, task),
    description: text(message.description) || task.description,
    lastTool: text(message.last_tool_name) || task.lastTool,
    summary: text(message.summary) || task.summary,
    workflow: workflowProgress(message.workflow_progress) ?? task.workflow,
  }));
}

function ended(tasks: ChatTasks, id: unknown): ChatTasks {
  return tasks.filter((task) => task.id !== id);
}

// background_tasks_changed is the whole set of live background tasks, so a background task missing
// from it has ended, and one there that the strip never saw start (a resumed one) is added.
function replaced(tasks: ChatTasks, listed: unknown): ChatTasks {
  const live = Array.isArray(listed) ? listed.filter(isRecord) : [];
  const ids = new Set(live.map((entry) => text(entry.task_id)));
  let next: ChatTasks = tasks.filter((task) => !task.backgrounded || ids.has(task.id));
  for (const entry of live) next = started(next, { ...entry, is_backgrounded: true });
  return next.map((task) => (ids.has(task.id) ? { ...task, backgrounded: true } : task));
}

// The tasks after one system message, or the same list when the message is not about tasks.
export function applyTaskMessage(tasks: ChatTasks, message: Record<string, unknown>): ChatTasks {
  switch (message.subtype) {
    case 'task_started': return started(tasks, message);
    case 'task_progress': return progressed(tasks, message);
    case 'task_updated': {
      const patch = isRecord(message.patch) ? message.patch : {};
      if (ENDED.has(text(patch.status))) return ended(tasks, message.task_id);
      return patch.is_backgrounded === true
        ? tasks.map((task) => (task.id === message.task_id ? { ...task, backgrounded: true } : task))
        : tasks;
    }
    case 'task_notification': return ended(tasks, message.task_id);
    case 'background_tasks_changed': return replaced(tasks, message.tasks);
    default: return tasks;
  }
}

// The tasks in the order the strip draws them, each under the one that started it with how deep it
// sits, 0 for one the main thread started. A task whose starter is not listed sits at the top.
export function taskOrder(tasks: ChatTasks): { task: ChatTask; depth: number }[] {
  const ids = new Set(tasks.map((task) => task.id));
  const under = (parent: string | null, depth: number): { task: ChatTask; depth: number }[] => tasks
    .filter((task) => (task.parent !== null && ids.has(task.parent) ? task.parent : null) === parent)
    .flatMap((task) => [{ task, depth }, ...under(task.id, depth + 1)]);
  return under(null, 0);
}

// One row's text after its description: what kind of task, then what it has done so far.
export function taskDetail(task: ChatTask): string {
  return [task.kind, task.workflow && workflowBar(task.workflow), ...usageParts(task), task.lastTool].filter(Boolean).join(' · ');
}

// What an agent has done, as its strip row and the Agent call that started it both say it: its tool
// calls, its tokens and its time, each left out while it is nought. The tokens are the session's
// total_tokens, its last request's whole context and output, which is the figure Claude Code shows.
export type AgentUsage = { tools: number; tokens: number; seconds: number };

export function usageParts(usage: AgentUsage): string[] {
  const parts: string[] = [];
  if (usage.tools > 0) parts.push(`${usage.tools} ${usage.tools === 1 ? 'tool' : 'tools'}`);
  if (usage.tokens > 0) parts.push(`${formatTokens(usage.tokens)} tokens`);
  if (usage.seconds > 0) parts.push(`${usage.seconds}s`);
  return parts;
}

// The row the task key picks next, in the strip's order: the first with none picked, then each in
// turn, then none again after the last, so the key also lets go of the strip.
export function nextTaskSelection(tasks: ChatTasks, selected: string | null): string | null {
  const ids = taskOrder(tasks).map(({ task }) => task.id);
  const at = selected === null ? -1 : ids.indexOf(selected);
  return ids[at + 1] ?? null;
}

// The pick kept when the strip gets new tasks: let go once nothing is running, so a pick whose task
// ended refuses only while other tasks still run, never for the rest of the pane's life.
export function keptSelection(tasks: ChatTasks, selected: string | null): string | null {
  return tasks.length === 0 ? null : selected;
}

// The picked task; 'ended' once it has left the strip, so a key meant for it never falls back to
// acting on every task; null with none picked. The task key walks on from an ended one.
export function pickedTask(tasks: ChatTasks, selected: string | null): ChatTask | 'ended' | null {
  if (selected === null) return null;
  return tasks.find((task) => task.id === selected) ?? 'ended';
}

// What the stop and background keys both say when the picked task has left the strip.
const TASK_ENDED = 'The picked task has ended. The task key picks another, or none after the last.';

export type StopTarget = { kind: 'one'; taskId: string } | { kind: 'refused'; reason: string };

// What the stop key does: stops the picked task, and nothing with none picked.
export function stopTarget(task: ChatTask | 'ended' | null): StopTarget {
  if (task === null) return { kind: 'refused', reason: 'No task picked. The task key picks one in the strip over the box.' };
  if (task === 'ended') return { kind: 'refused', reason: TASK_ENDED };
  return { kind: 'one', taskId: task.id };
}

export type WorkflowTarget = { kind: 'open'; task: ChatTask } | { kind: 'refused'; reason: string };

// What the workflow key opens: the picked task when it is a workflow, else the first workflow the
// strip lists.
export function workflowTarget(tasks: ChatTasks, picked: ChatTask | 'ended' | null): WorkflowTarget {
  if (picked !== null && picked !== 'ended' && picked.workflow) return { kind: 'open', task: picked };
  const first = taskOrder(tasks).find(({ task }) => task.workflow)?.task;
  return first ? { kind: 'open', task: first } : { kind: 'refused', reason: 'No workflow is running.' };
}

export type BackgroundTarget = { kind: 'all' } | { kind: 'one'; toolUseId: string } | { kind: 'refused'; reason: string };

// What the background key does: with no row picked, every foreground task, as Ctrl+B in the terminal;
// with one picked, that one, which only a foreground task started by a tool call can be.
export function backgroundTarget(task: ChatTask | 'ended' | null): BackgroundTarget {
  if (task === null) return { kind: 'all' };
  if (task === 'ended') return { kind: 'refused', reason: TASK_ENDED };
  if (task.backgrounded) return { kind: 'refused', reason: 'That task is already running in the background.' };
  if (task.toolUseId === null) return { kind: 'refused', reason: 'That task names no tool call to background. With no task picked, the key backgrounds them all.' };
  return { kind: 'one', toolUseId: task.toolUseId };
}
