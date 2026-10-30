import { formatTokens } from './usage';
import { isRecord } from './is-record';

// The agents, workflows and background commands Claude has running, as the strip over the box lists
// them. The session streams them as system messages — task_started, task_progress, task_updated,
// task_notification, and background_tasks_changed with the whole set of background ones — and only
// while it runs: a saved session keeps none, so a reopened one shows its tasks from the next change.

export type ChatTask = {
  id: string;
  description: string;
  // An agent's type, "general-purpose" or a custom agent's name; a workflow's name; or the kind of task.
  kind: string;
  // How deep the task sits under the agent that started it, 0 for one the main thread started.
  depth: number;
  parent: string | null;
  backgrounded: boolean;
  tools: number;
  tokens: number;
  seconds: number;
  lastTool: string | null;
  summary: string | null;
};

export type ChatTasks = readonly ChatTask[];

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// A task the strip leaves out: Claude Code's own housekeeping, which it marks as not being activity.
function quiet(message: Record<string, unknown>): boolean {
  return message.ambient === true || message.skip_transcript === true;
}

function kindOf(message: Record<string, unknown>): string {
  return text(message.subagent_type) || text(message.workflow_name) || text(message.task_type).replace(/_/g, ' ') || 'task';
}

function started(tasks: ChatTasks, message: Record<string, unknown>): ChatTasks {
  const id = text(message.task_id);
  if (!id || quiet(message) || tasks.some((task) => task.id === id)) return tasks;
  const parent = text(message.parent_task_id) || null;
  const depth = typeof message.spawn_depth === 'number' ? Math.max(0, message.spawn_depth - 1)
    : (tasks.find((task) => task.id === parent)?.depth ?? -1) + 1;
  return [...tasks, {
    id, description: text(message.description), kind: kindOf(message), depth, parent,
    backgrounded: message.is_backgrounded === true, tools: 0, tokens: 0, seconds: 0, lastTool: null, summary: null,
  }];
}

function progressed(tasks: ChatTasks, message: Record<string, unknown>): ChatTasks {
  const usage = isRecord(message.usage) ? message.usage : {};
  const count = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);
  return tasks.map((task) => (task.id !== message.task_id ? task : {
    ...task,
    description: text(message.description) || task.description,
    tools: count(usage.tool_uses, task.tools),
    tokens: count(usage.total_tokens, task.tokens),
    seconds: Math.round(count(usage.duration_ms, task.seconds * 1000) / 1000),
    lastTool: text(message.last_tool_name) || task.lastTool,
    summary: text(message.summary) || task.summary,
  }));
}

function ended(tasks: ChatTasks, id: unknown): ChatTasks {
  return tasks.filter((task) => task.id !== id);
}

// background_tasks_changed is the whole set of live background tasks, so a background task missing
// from it has ended, and one there that the strip never saw start (a resumed one) is added.
function replaced(tasks: ChatTasks, listed: unknown): ChatTasks {
  const live = (Array.isArray(listed) ? listed.filter(isRecord) : []).filter((entry) => !quiet(entry));
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

// The tasks in the order the strip draws them: each under the one that started it.
export function taskOrder(tasks: ChatTasks): ChatTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const under = (parent: string | null): ChatTask[] => tasks
    .filter((task) => (task.parent !== null && ids.has(task.parent) ? task.parent : null) === parent)
    .flatMap((task) => [task, ...under(task.id)]);
  return under(null);
}

// One row's text after its description: what kind of task, then what it has done so far.
export function taskDetail(task: ChatTask): string {
  const parts = [task.kind];
  if (task.tools > 0) parts.push(`${task.tools} ${task.tools === 1 ? 'tool' : 'tools'}`);
  if (task.tokens > 0) parts.push(`${formatTokens(task.tokens)} tokens`);
  if (task.seconds > 0) parts.push(`${task.seconds}s`);
  if (task.lastTool) parts.push(task.lastTool);
  return parts.join(' · ');
}
