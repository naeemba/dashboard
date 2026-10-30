import { isRecord, stringOrEmpty as text } from './is-record';
import { formatTokens } from './usage';

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
  tools: number;
  tokens: number;
  seconds: number;
  lastTool: string | null;
  summary: string | null;
};

export type ChatTasks = readonly ChatTask[];

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);

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
  if (description === task.description && kind === task.kind && parent === task.parent) return task;
  return { ...task, description, kind, parent };
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
  const parts = [task.kind];
  if (task.tools > 0) parts.push(`${task.tools} ${task.tools === 1 ? 'tool' : 'tools'}`);
  if (task.tokens > 0) parts.push(`${formatTokens(task.tokens)} tokens`);
  if (task.seconds > 0) parts.push(`${task.seconds}s`);
  if (task.lastTool) parts.push(task.lastTool);
  return parts.join(' · ');
}
