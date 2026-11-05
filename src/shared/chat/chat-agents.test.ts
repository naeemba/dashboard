import { describe, expect, it } from 'vitest';
import { agentConversation, agentRows, finishedAfter, KEPT_CONVERSATIONS, resultUsage, type FinishedTask } from './chat-agents';
import { applyTaskMessage, type ChatTasks } from './chat-tasks';

// Shaped as Claude Code 2.1.318 sent them for one Agent call.
const started = {
  type: 'system', subtype: 'task_started', task_id: 'a', tool_use_id: 'call-a', description: 'List X11 and read hostname',
  subagent_type: 'general-purpose', is_backgrounded: false, task_type: 'local_agent',
};
const progress = {
  type: 'system', subtype: 'task_progress', task_id: 'a', tool_use_id: 'call-a', description: 'Reading /etc/hostname',
  usage: { total_tokens: 28_597, tool_uses: 2, duration_ms: 3257 }, last_tool_name: 'Read',
};
const updated = { type: 'system', subtype: 'task_updated', task_id: 'a', patch: { status: 'completed', end_time: 1 } };
const notified = {
  type: 'system', subtype: 'task_notification', task_id: 'a', tool_use_id: 'call-a', status: 'completed',
  summary: 'This agent\'s report was delivered to you as a message.', usage: { total_tokens: 33_075, tool_uses: 3, duration_ms: 5326 },
  handback_report: { text: '/etc/X11 holds three directories.\nThe hostname is box.' },
};

// The strip and the finished list folded together, as the transcript does.
function fold(messages: Record<string, unknown>[]): { tasks: ChatTasks; finished: FinishedTask[] } {
  let tasks: ChatTasks = [];
  let finished: FinishedTask[] = [];
  for (const message of messages) {
    const after = applyTaskMessage(tasks, message);
    finished = finishedAfter(finished, tasks, after, message);
    tasks = after;
  }
  return { tasks, finished };
}

describe('finishedAfter', () => {
  it('keeps an agent once it ends, with the final count and the report it handed back', () => {
    const { tasks, finished } = fold([started, progress, updated, notified]);
    expect(tasks).toEqual([]);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      id: 'a', status: 'completed', tools: 3, tokens: 33_075, seconds: 5, summary: '/etc/X11 holds three directories.\nThe hostname is box.',
    });
  });

  it('keeps the newest first, and a notification alone ends a task too', () => {
    const { finished } = fold([started, { ...started, task_id: 'b' }, { ...notified, task_id: 'b', status: 'stopped' }, updated]);
    expect(finished.map((task) => [task.id, task.status])).toEqual([['a', 'completed'], ['b', 'stopped']]);
  });

  it('says ended for a background task that left the set without a status', () => {
    const { finished } = fold([{ ...started, is_backgrounded: true }, { type: 'system', subtype: 'background_tasks_changed', tasks: [] }]);
    expect(finished.map((task) => task.status)).toEqual(['ended']);
  });

  it('is the same list for a message that ends nothing', () => {
    const before = fold([started, updated]).finished;
    expect(finishedAfter(before, [], [], progress)).toBe(before);
  });
});

describe('resultUsage', () => {
  it('reads the count an Agent call\'s result ends with, in either spelling', () => {
    expect(resultUsage('done\nagentId: a\n<usage>subagent_tokens: 33075\ntool_uses: 3\nduration_ms: 5329</usage>'))
      .toEqual({ tokens: 33_075, tools: 3, seconds: 5 });
    expect(resultUsage('<usage>total_tokens: 900\ntool_uses: 1\nduration_ms: 400</usage>')).toEqual({ tokens: 900, tools: 1, seconds: 0 });
  });

  it('is null for a result that has none', () => {
    expect(resultUsage('plain output')).toBeNull();
    expect(resultUsage('<usage>nothing counted</usage>')).toBeNull();
  });
});

describe('agentRows', () => {
  it('lists what runs, then what finished with how it ended and the first line of its report', () => {
    const { finished } = fold([started, progress, updated, notified]);
    const running = fold([{ ...started, task_id: 'r', description: 'Still going' }]).tasks;
    expect(agentRows(running, finished, '').map((row) => [row.name, row.detail])).toEqual([
      ['Still going', 'running · general-purpose'],
      ['Reading /etc/hostname', 'completed · general-purpose · 3 tools · 33.1K tokens · 5s · Read · /etc/X11 holds three directories.'],
    ]);
  });

  it('narrows by what is typed', () => {
    const { finished } = fold([started, progress, updated, notified]);
    expect(agentRows([], finished, 'zzz')).toEqual([]);
    expect(agentRows([], finished, 'hostname')).toHaveLength(1);
  });
});

describe('agentConversation', () => {
  const agent = fold([started]).tasks[0];
  const workflow = fold([{ type: 'system', subtype: 'task_started', task_id: 'w', tool_use_id: 'call-w', description: 'Spec', task_type: 'local_workflow', workflow_name: 'spec' }]).tasks[0];
  const command = fold([{ type: 'system', subtype: 'task_started', task_id: 'b', tool_use_id: 'call-b', description: 'npm test', task_type: 'local_bash' }]).tasks[0];

  it('opens an agent that has said something', () => {
    expect(agentConversation(agent, { 'call-a': [] })).toEqual({ kind: 'open', id: 'call-a' });
  });

  it('opens a running agent that has said nothing yet, to fill as it goes', () => {
    expect(agentConversation(agent, {})).toEqual({ kind: 'open', id: 'call-a' });
  });

  it('refuses a finished agent whose conversation is not kept, and says how many are', () => {
    const answer = agentConversation({ ...agent, status: 'completed' }, {});
    expect(answer).toMatchObject({ kind: 'refused' });
    expect(answer.kind === 'refused' && answer.reason).toContain(`last ${KEPT_CONVERSATIONS} agents'`);
  });

  it('refuses a workflow and a background command, which have no conversation', () => {
    expect(agentConversation(workflow, { 'call-w': [] })).toMatchObject({ kind: 'refused' });
    expect(agentConversation(command, {})).toMatchObject({ kind: 'refused' });
  });
});
