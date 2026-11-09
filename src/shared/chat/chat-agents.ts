import { isRecord, stringOrEmpty as text } from '../app/is-record';
import { ranked, type SearchRow } from '../app/fuzzy';
import type { Refused } from '../app/bridge';
import { printableLines } from '../manager/tasks';
import { messageUsage, taskDetail, taskOrder, type AgentUsage, type ChatTask, type ChatTasks } from './chat-tasks';

// The agents, workflows and background commands that ended this conversation, for the agents key's
// list, and what each agent did, for the Agent call that started it. The strip (chat-tasks.ts) drops a
// task when it ends; this keeps it, with the last count the session gave and how it ended.

// `status` is the session's own word, completed, failed, killed or stopped; `ended` when the task
// left the set of background tasks without one.
export type FinishedTask = ChatTask & { status: string };

// How many agents' whole conversations the transcript keeps, the newest started: each holds its tools'
// output, and a session that runs agents all day would hold every one of them for nobody.
export const KEPT_CONVERSATIONS = 20;

// The conversations kept once one has changed: past the cap the oldest started are dropped, but never
// a running agent's, which someone may still be watching and whose next message would otherwise start
// it again from there. More than the cap running keeps them all.
export function keptConversations<T>(agents: Record<string, T>, tasks: ChatTasks): Record<string, T> {
  const ids = Object.keys(agents);
  if (ids.length <= KEPT_CONVERSATIONS) return agents;
  const running = new Set(tasks.map((task) => task.toolUseId));
  const dropped = new Set(ids.filter((id) => !running.has(id)).slice(0, ids.length - KEPT_CONVERSATIONS));
  return Object.fromEntries(Object.entries(agents).filter(([id]) => !dropped.has(id)));
}

export type TaskOpening =
  | { kind: 'workflow' }
  | { kind: 'conversation'; id: string }
  | { kind: 'output'; taskId: string }
  | { kind: 'refused'; reason: string };

// What opening a task in the agents list or the strip does, by its kind: a workflow opens its panel,
// an agent its conversation, and anything else, a background shell command or a Monitor, the output
// it has written. An agent still running that has said nothing yet opens empty and fills as it goes;
// a finished one without a conversation ran before the screen opened or was dropped for newer ones.
export function taskOpening(task: ChatTask | FinishedTask, agents: Record<string, unknown>): TaskOpening {
  if (task.workflow) return { kind: 'workflow' };
  if (!task.agent) return { kind: 'output', taskId: task.id };
  const name = task.description || task.kind;
  if (task.toolUseId === null) return { kind: 'refused', reason: `${name} has no conversation to show: the session did not name the call that started it.` };
  if (task.toolUseId in agents || !('status' in task)) return { kind: 'conversation', id: task.toolUseId };
  return { kind: 'refused', reason: `${name} has no conversation to show: only the last ${KEPT_CONVERSATIONS} agents' are kept, from when the screen opened.` };
}

// What `chat-task:output` answers: the end of a shell or Monitor task's output, the last 8 KiB the
// session keeps, or why it cannot be read.
export type TaskOutputRead = { output: string; truncated: boolean } | Refused;

export type TaskOutputShown = { kind: 'text'; text: string } | { kind: 'refused'; reason: string };

// What the output viewer shows for one read: the output as plain lines, escape codes gone, with a
// first line saying when the start was cut. A running task that has printed nothing yet shows empty
// and fills as it goes; an ended one with nothing to read printed nothing, or its file is gone.
export function taskOutputShown(name: string, read: TaskOutputRead, running: boolean): TaskOutputShown {
  if ('refused' in read) return { kind: 'refused', reason: `${name}'s output cannot be read: ${read.refused}` };
  if (read.output === '' && !running) return { kind: 'refused', reason: `${name} has no output to show: it printed nothing, or its output file is gone.` };
  const text = printableLines(read.output).join('\n');
  return { kind: 'text', text: read.truncated ? `… only the last 8 KiB is kept\n${text}` : text };
}

// The count an Agent call's result ends with, `<usage>subagent_tokens: 33075 tool_uses: 3
// duration_ms: 5329</usage>`, an older session's saying total_tokens; null for a result without one.
// It is what a conversation read back from disk has, since the task messages are never saved.
export function resultUsage(result: string): AgentUsage | null {
  const block = /<usage>([\s\S]*?)<\/usage>/.exec(result)?.[1];
  if (block === undefined) return null;
  const read = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)`).exec(block)?.[1] ?? 0);
  const tokens = read('subagent_tokens') || read('total_tokens');
  return tokens > 0 ? { tools: read('tool_uses'), tokens, seconds: Math.round(read('duration_ms') / 1000) } : null;
}

function statusOf(message: Record<string, unknown>): string {
  const patch = isRecord(message.patch) ? message.patch : {};
  return text(message.status) || text(patch.status) || 'ended';
}

// What the agent reported back: the handback's text when it sent one, since the summary then only
// says the report went elsewhere.
function summaryOf(message: Record<string, unknown>): string {
  const handback = isRecord(message.handback_report) ? message.handback_report : {};
  return text(handback.text) || text(message.summary);
}

// The finished list after one task message, newest first. `running` and `after` are the strip's tasks
// before and after the message (applyTaskMessage). A task the message ended joins the list; the
// notification that follows an update's end fills in the final count and report.
export function finishedAfter(finished: FinishedTask[], running: ChatTasks, after: ChatTasks, message: Record<string, unknown>): FinishedTask[] {
  const left = running.filter((task) => !after.some((still) => still.id === task.id));
  const summary = summaryOf(message);
  const closing = (task: ChatTask): FinishedTask => ({
    ...task, ...(messageUsage(message, task) ?? {}), summary: summary || task.summary, status: statusOf(message),
  });
  if (left.length > 0) return [...left.map(closing).reverse(), ...finished];
  if (message.subtype !== 'task_notification' || !finished.some((task) => task.id === message.task_id)) return finished;
  return finished.map((task) => (task.id === message.task_id ? closing(task) : task));
}

export type AgentRow = SearchRow<ChatTask>;

// The agents key's list: what is running, in the strip's order, then what finished, newest first,
// narrowed by what is typed.
export function agentRows(running: ChatTasks, finished: FinishedTask[], query: string): AgentRow[] {
  const row = (task: ChatTask, status: string): AgentRow => ({
    name: task.description || task.kind,
    detail: [status, taskDetail(task), task.summary?.split('\n')[0]].filter(Boolean).join(' · '),
    choice: task,
  });
  const rows = [...taskOrder(running).map(({ task }) => row(task, 'running')), ...finished.map((task) => row(task, task.status))];
  return ranked(rows, (each) => `${each.name} ${each.detail}`, query);
}
