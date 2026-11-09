import { describe, expect, it } from 'vitest';
import { agentRows, followAfter, readTaskOutput, taskOpening, taskOutputRefusal, taskOutputShown, finishedAfter, KEPT_CONVERSATIONS, resultUsage, type FinishedTask } from './chat-agents';
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

describe('taskOpening', () => {
  const agent = fold([started]).tasks[0];
  const workflow = fold([{ type: 'system', subtype: 'task_started', task_id: 'w', tool_use_id: 'call-w', description: 'Spec', task_type: 'local_workflow', workflow_name: 'spec' }]).tasks[0];
  const command = fold([{ type: 'system', subtype: 'task_started', task_id: 'b', tool_use_id: 'call-b', description: 'npm test', task_type: 'local_bash' }]).tasks[0];
  const monitor = fold([{ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'm', task_type: 'monitor_mcp', description: 'eval batch progress lines' }] }]).tasks[0];

  it('opens an agent that has said something', () => {
    expect(taskOpening(agent, { 'call-a': [] })).toEqual({ kind: 'conversation', id: 'call-a' });
  });

  it('opens a running agent that has said nothing yet, to fill as it goes', () => {
    expect(taskOpening(agent, {})).toEqual({ kind: 'conversation', id: 'call-a' });
  });

  it('refuses a finished agent whose conversation is not kept, and says how many are', () => {
    const answer = taskOpening({ ...agent, status: 'completed' }, {});
    expect(answer).toMatchObject({ kind: 'refused' });
    expect(answer.kind === 'refused' && answer.reason).toContain(`last ${KEPT_CONVERSATIONS} agents'`);
  });

  it('opens a workflow\'s panel, even with a conversation under its call', () => {
    expect(taskOpening(workflow, { 'call-w': [] })).toEqual({ kind: 'workflow' });
  });

  it('opens a background command\'s and a monitor\'s output, running or finished, by task id', () => {
    expect(taskOpening(command, {})).toEqual({ kind: 'output', taskId: 'b' });
    expect(taskOpening({ ...command, status: 'completed' }, {})).toEqual({ kind: 'output', taskId: 'b' });
    expect(taskOpening(monitor, {})).toEqual({ kind: 'output', taskId: 'm' });
  });

  it('refuses a kind the session keeps no output for, an MCP call, naming it', () => {
    const call = fold([{ type: 'system', subtype: 'task_started', task_id: 'c', tool_use_id: 'call-c', description: 'Fetch report', task_type: 'mcp_task' }]).tasks[0];
    const answer = taskOpening(call, {});
    expect(answer.kind === 'refused' && answer.reason).toBe('Fetch report has nothing to show: only an agent, a workflow, a shell command or a Monitor opens.');
  });

  it('refuses an agent whose call the session did not name', () => {
    const answer = taskOpening({ ...agent, toolUseId: null }, {});
    expect(answer.kind === 'refused' && answer.reason).toContain('did not name the call');
  });
});

describe('taskOutputShown', () => {
  it('shows the output as plain lines, escape codes and redrawn progress gone', () => {
    expect(taskOutputShown('npm test', { output: '\u001B[32mok\u001B[0m\n10%\r100%\n', truncated: false, total_bytes: 0 }, true))
      .toEqual({ kind: 'text', text: 'ok\n100%\n' });
  });

  it('says the start was cut when only the end is kept', () => {
    expect(taskOutputShown('npm test', { output: 'last', truncated: true, total_bytes: 20_480 }, false))
      .toEqual({ kind: 'text', text: '… the start is cut: 20 KiB written, only the last 8 KiB is kept\nlast' });
    expect(taskOutputShown('npm test', { output: 'last', truncated: true, total_bytes: 3_250_000 }, false))
      .toMatchObject({ text: expect.stringContaining('3.1 MiB written') });
  });

  it('shows a running task that has printed nothing yet empty, to fill as it goes', () => {
    expect(taskOutputShown('npm test', { output: '', truncated: false, total_bytes: 0 }, true)).toEqual({ kind: 'text', text: '' });
  });

  it('refuses an ended task with nothing to read, naming it', () => {
    const shown = taskOutputShown('npm test', { output: '', truncated: false, total_bytes: 0 }, false);
    expect(shown.kind === 'refused' && shown.reason).toBe('npm test has no output to show: it printed nothing, or its output file is gone.');
  });

  it('names the task in main\'s refusal', () => {
    const shown = taskOutputShown('npm test', { refused: 'the session has ended.' }, true);
    expect(shown.kind === 'refused' && shown.reason).toBe('npm test\'s output cannot be read: the session has ended.');
  });
});

describe('taskOutputRefusal', () => {
  it('says whether the session ended or its Claude Code lacks the call', () => {
    expect(taskOutputRefusal(undefined)).toBe('the session has ended.');
    expect(taskOutputRefusal({})).toBe('this version of Claude Code cannot read a task\'s output.');
  });
});

describe('readTaskOutput', () => {
  it('asks whether the task runs before the read, so the read it ended during is not the last', async () => {
    let running = true;
    const read = await readTaskOutput('npm test', async () => {
      running = false;
      return { output: 'summary', truncated: false, total_bytes: 7 };
    }, () => running);
    expect(read).toEqual({ running: true, shown: { kind: 'text', text: 'summary' } });
  });
});

describe('followAfter', () => {
  const text = { kind: 'text', text: 'ok' } as const;
  const refused = { kind: 'refused', reason: 'no' } as const;

  it('draws and asks again while the task runs', () => {
    expect(followAfter({ running: true, shown: text })).toEqual({ draw: 'ok', again: true });
  });

  it('draws the read after the task ended and stops', () => {
    expect(followAfter({ running: false, shown: text })).toEqual({ draw: 'ok', again: false });
  });

  it('keeps what it shows and stops on a refusal, running or not', () => {
    expect(followAfter({ running: true, shown: refused })).toEqual({ draw: null, again: false });
    expect(followAfter({ running: false, shown: refused })).toEqual({ draw: null, again: false });
  });
});
