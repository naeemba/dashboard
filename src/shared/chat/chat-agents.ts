import { isRecord, stringOrEmpty as text } from '../app/is-record';
import { ranked, type SearchRow } from '../app/fuzzy';
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

export type AgentConversation = { kind: 'open'; id: string } | { kind: 'refused'; reason: string };

// The conversation the agents key opens for a task. An agent still running that has said nothing yet
// opens empty and fills as it goes; a finished one without a conversation ran before the screen opened
// or was dropped for newer ones.
export function agentConversation(task: ChatTask | FinishedTask, agents: Record<string, unknown>): AgentConversation {
  const name = task.description || task.kind;
  if (!task.agent || task.toolUseId === null) return { kind: 'refused', reason: `${name} has no conversation to show: only an agent has one.` };
  if (task.toolUseId in agents || !('status' in task)) return { kind: 'open', id: task.toolUseId };
  return { kind: 'refused', reason: `${name} has no conversation to show: only the last ${KEPT_CONVERSATIONS} agents' are kept, from when the screen opened.` };
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
  const usage = messageUsage(message);
  const summary = summaryOf(message);
  const closing = (task: ChatTask): FinishedTask => ({
    ...task, ...(usage ?? {}), summary: summary || task.summary, status: statusOf(message),
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
