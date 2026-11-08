import type { ChatCommand } from '../../shared/keys/actions';
import { backgroundTarget, stopTarget, workflowTarget, type ChatTasks } from '../../shared/chat/chat-tasks';
import { failureText } from '../../shared/errors/failure';
import type { AgentsView } from './chat-agents-view';
import type { TaskStrip } from './chat-task-strip';
import type { WorkflowView } from './chat-workflow-view';
import type { ChatViewOptions } from './chat-view';

// The keys about Claude's running tasks, as chat-view.ts's runCommand hands them on: the task key
// picks a strip row, the stop and background keys act on it, the agents key lists every agent, and
// the workflow key opens a workflow's phases.
export type TaskScreen = {
  options: ChatViewOptions;
  slot: number;
  strip: TaskStrip;
  agents: AgentsView;
  workflows: WorkflowView;
  tasks: () => ChatTasks;
};

export function runTaskCommand(command: ChatCommand, screen: TaskScreen): void {
  if (command === 'task-select') screen.strip.step();
  if (command === 'task-stop') stopTask(screen);
  if (command === 'task-background') backgroundTask(screen);
  if (command === 'agents') screen.agents.show();
  if (command === 'workflow') showWorkflow(screen);
}

function showWorkflow({ options, strip, workflows, tasks }: TaskScreen): void {
  const target = workflowTarget(tasks(), strip.picked());
  if (target.kind === 'refused') return options.onNotice(target.reason);
  workflows.open(target.task);
}

function stopTask({ options, slot, strip }: TaskScreen): void {
  const target = stopTarget(strip.picked());
  if (target.kind === 'refused') return options.onNotice(target.reason);
  options.bridge.chatStopTask(slot, target.taskId).catch((error: unknown) => options.onError(`Task not stopped: ${failureText(error)}`));
}

function backgroundTask({ options, slot, strip }: TaskScreen): void {
  const target = backgroundTarget(strip.picked());
  if (target.kind === 'refused') return options.onNotice(target.reason);
  options.bridge.chatBackgroundTasks(slot, target.kind === 'one' ? target.toolUseId : undefined).then((matched) => {
    if (!matched) options.onNotice(target.kind === 'one' ? 'That task is no longer in the foreground.' : 'Claude has no task running.');
  }, (error: unknown) => options.onError(`Not sent to the background: ${failureText(error)}`));
}
