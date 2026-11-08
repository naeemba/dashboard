import { describe, expect, it } from 'vitest';
import { agentCount, heldWorkflowRow, panelUpdate, phaseMark, workflowBar, workflowProgress, workflowRows } from './chat-workflow';
import { applyTaskMessage, taskDetail, type ChatTasks } from './chat-tasks';

const phase = (index: number, title: string) => ({ type: 'workflow_phase', index, title, kind: 'phase' });
const agent = (index: number, phaseIndex: number, extra: Record<string, unknown> = {}) =>
  ({ type: 'workflow_agent', index, label: `agent ${index}`, phaseIndex, model: 'opus', state: 'start', ...extra });

describe('workflowProgress', () => {
  it('groups agents under their phases, one entry per agent', () => {
    const progress = workflowProgress([
      phase(0, 'Review'), phase(1, 'Fix'),
      agent(1, 0, { state: 'done', queuedAt: 1, startedAt: 1_000, lastProgressAt: 31_000, tokens: 12_000, toolCalls: 3 }),
      agent(2, 0, { state: 'progress', startedAt: 5_000 }),
      { type: 'workflow_log', message: 'hello' },
    ]);
    expect(progress?.phases.map((one) => [one.title, one.agents.map((each) => each.state)])).toEqual([['Review', ['done', 'running']], ['Fix', []]]);
    expect(progress?.phases[0].agents[0]).toMatchObject({ tokens: 12_000, tools: 3, seconds: 30, model: 'opus' });
  });

  it('puts agents outside any phase last, and reads an error as failed', () => {
    const progress = workflowProgress([agent(1, -1, { phaseIndex: undefined, state: 'error' }), agent(2, 0, { phaseTitle: 'Scan' })]);
    expect(progress?.phases.map((one) => one.title)).toEqual(['Scan', 'Agents']);
    expect(progress?.phases[1].agents[0].state).toBe('failed');
  });

  it('is null when the message carries no list', () => {
    expect(workflowProgress(undefined)).toBeNull();
  });
});

describe('marks and counts', () => {
  const progress = workflowProgress([phase(0, 'A'), phase(1, 'B'), phase(2, 'C'),
    agent(1, 0, { state: 'done' }), agent(2, 0, { state: 'error' }), agent(3, 1, { state: 'progress', startedAt: 1 })])!;

  it('marks a phase by its agents', () => {
    expect(progress.phases.map(phaseMark)).toEqual(['done', 'running', 'waiting']);
    expect(agentCount(progress.phases)).toEqual({ done: 2, total: 3 });
  });

  it('draws the bar from agents ended of agents started', () => {
    expect(workflowBar(progress)).toBe(`${'▰'.repeat(7)}${'▱'.repeat(3)} 2/3 agents`);
    expect(workflowBar({ phases: [] })).toBeNull();
  });
});

describe('a workflow task', () => {
  it('is a workflow from its start and takes each list its progress carries', () => {
    const fold = (messages: Record<string, unknown>[]): ChatTasks => messages.reduce(applyTaskMessage, []);
    const tasks = fold([
      { type: 'system', subtype: 'task_started', task_id: 'w', task_type: 'local_workflow', workflow_name: 'pr-loop', description: 'Review the PR' },
      { type: 'system', subtype: 'task_progress', task_id: 'w', usage: { total_tokens: 2_000, tool_uses: 1, duration_ms: 9_000 }, workflow_progress: [phase(0, 'Review'), agent(1, 0, { state: 'done' })] },
      { type: 'system', subtype: 'task_progress', task_id: 'w', usage: { total_tokens: 3_000 } },
    ]);
    expect(tasks[0].workflow?.phases[0].agents).toHaveLength(1);
    expect(taskDetail(tasks[0])).toBe(`pr-loop · ${'▰'.repeat(10)} 1/1 agent · 1 tool · 3K tokens · 9s`);
  });
});

describe('the workflow panel', () => {
  const two = workflowProgress([phase(0, 'Review'), phase(1, 'Review')]);
  const three = workflowProgress([phase(0, 'Review'), phase(1, 'Review'), phase(2, 'Fix')]);

  it('lists phases by index, and the stop row only while it runs', () => {
    expect(workflowRows(two, true)).toEqual([0, 1, 'stop']);
    expect(workflowRows(two, false)).toEqual([0, 1]);
    expect(workflowRows(null, true)).toEqual(['stop']);
  });

  it('keeps the selection on its phase, even beside one with the same title', () => {
    expect(heldWorkflowRow(workflowRows(two, true), workflowRows(three, true), 1)).toBe(1);
    expect(heldWorkflowRow(workflowRows(two, true), workflowRows(three, true), 2)).toBe(3);
  });

  it('does not leave the selection on stop when it was the only row', () => {
    expect(heldWorkflowRow(workflowRows(null, true), workflowRows(two, true), 0)).toBe(0);
  });

  it('drops the stop row once ended and clamps the selection onto the last phase', () => {
    expect(heldWorkflowRow(workflowRows(two, true), workflowRows(two, false), 2)).toBe(1);
  });

  it('takes the task as streamed, marks it ended once gone, and skips what changed nothing', () => {
    const task = { id: 'w' };
    const now = { id: 'w' };
    expect(panelUpdate({ task, live: true }, task)).toBeNull();
    expect(panelUpdate({ task, live: true }, now)).toEqual({ task: now, live: true });
    expect(panelUpdate({ task, live: true }, undefined)).toEqual({ task, live: false });
    expect(panelUpdate({ task, live: false }, undefined)).toBeNull();
  });
});
