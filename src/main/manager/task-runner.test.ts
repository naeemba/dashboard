import { describe, expect, it } from 'vitest';
import type { ScopedCommand } from '../processes/scope';
import type { TaskResult } from '../../shared/manager/tasks';
import { taskRunner } from './task-runner';

describe('taskRunner', () => {
  it('drops a run whose scope check was overtaken by a cancel, telling each row once', async () => {
    const sent: TaskResult[] = [];
    let answer: (command: ScopedCommand) => void = () => {};
    const tasks = taskRunner({
      send: (result) => sent.push(result),
      shellCommand: () => '/bin/sh',
      scoped: () => new Promise((resolve) => { answer = resolve; }),
    });
    const running = tasks.run('true', ['/work/api']);
    tasks.cancel();
    answer({ file: '/bin/sh', args: [], unit: null });
    await running;
    expect(sent.map((result) => [result.projectPath, result.state])).toEqual([['/work/api', 'cancelled']]);
  });
});
