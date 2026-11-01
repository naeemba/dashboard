import { isRecord, stringOrEmpty as text } from '../app/is-record';
import { formatTokens } from '../usage/usage';

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
    backgrounded: message.is_backgrounded === true, toolUseId: text(message.tool_use_id) || null, tools: 0, tokens: 0, seconds: 0, lastTool: null, summary: null,
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
export const TASK_ENDED = 'The picked task has ended. The task key picks another, or none after the last.';

export type StopTarget = { kind: 'one'; taskId: string } | { kind: 'refused'; reason: string };

// What the stop key does: stops the picked task, and nothing with none picked.
export function stopTarget(task: ChatTask | 'ended' | null): StopTarget {
  if (task === null) return { kind: 'refused', reason: 'No task picked. The task key picks one in the strip over the box.' };
  if (task === 'ended') return { kind: 'refused', reason: TASK_ENDED };
  return { kind: 'one', taskId: task.id };
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
