import { describe, expect, it } from 'vitest';
import { applyTaskMessage, taskDetail, taskOrder, type ChatTasks } from './chat-tasks';

const fold = (messages: Record<string, unknown>[], start: ChatTasks = []): ChatTasks =>
  messages.reduce(applyTaskMessage, start);
const startedTask = (id: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'system', subtype: 'task_started', task_id: id, description: `Review ${id}`, subagent_type: 'general-purpose', ...extra });

describe('applyTaskMessage', () => {
  it('lists a started agent and counts what it does', () => {
    const tasks = fold([startedTask('a'), {
      type: 'system', subtype: 'task_progress', task_id: 'a', description: 'Review a',
      usage: { tool_uses: 3, total_tokens: 12_000, duration_ms: 31_400 }, last_tool_name: 'Read',
    }]);
    expect(tasks).toHaveLength(1);
    expect(taskDetail(tasks[0])).toBe('general-purpose · 3 tools · 12K tokens · 31s · Read');
  });

  it('drops a task when it ends, by its status or its notification', () => {
    const two = fold([startedTask('a'), startedTask('b')]);
    expect(fold([{ type: 'system', subtype: 'task_updated', task_id: 'a', patch: { status: 'completed' } }], two).map((task) => task.id)).toEqual(['b']);
    expect(fold([{ type: 'system', subtype: 'task_notification', task_id: 'b', status: 'stopped' }], two).map((task) => task.id)).toEqual(['a']);
  });

  it('leaves out Claude Code\'s own housekeeping', () => {
    expect(fold([startedTask('a', { ambient: true }), startedTask('b', { skip_transcript: true })])).toEqual([]);
  });

  it('takes the set of background tasks as the whole truth for background ones, and leaves foreground ones be', () => {
    const tasks = fold([startedTask('fore'), startedTask('gone', { is_backgrounded: true }),
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'resumed', task_type: 'local_agent', description: 'Resumed' }] }]);
    expect(tasks.map((task) => task.id)).toEqual(['fore', 'resumed']);
  });

  it('keeps the same list for a message that is not about tasks, so nothing redraws', () => {
    const tasks = fold([startedTask('a')]);
    expect(applyTaskMessage(tasks, { type: 'system', subtype: 'status' })).toBe(tasks);
  });
});

describe('taskOrder', () => {
  it('puts each task under the one that started it, a level deeper', () => {
    const tasks = fold([startedTask('lead'), startedTask('other'), startedTask('helper', { parent_task_id: 'lead' })]);
    expect(taskOrder(tasks).map((task) => [task.id, task.depth])).toEqual([['lead', 0], ['helper', 1], ['other', 0]]);
  });
});
