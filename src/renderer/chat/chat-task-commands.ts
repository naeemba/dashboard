import type { ChatCommand } from '../../shared/keys/actions';
import { backgroundTarget, stopTarget } from '../../shared/chat/chat-tasks';
import { failureText } from '../../shared/errors/failure';
import type { AgentsView } from './chat-agents-view';
import type { TaskStrip } from './chat-task-strip';
import type { ChatViewOptions } from './chat-view';

// The keys about Claude's running tasks, as chat-view.ts's runCommand hands them on: the task key
// picks a strip row, the stop and background keys act on it, and the agents key lists every agent.
export type TaskScreen = {
  options: ChatViewOptions;
  slot: number;
  strip: TaskStrip;
  agents: AgentsView;
};

export function runTaskCommand(command: ChatCommand, screen: TaskScreen): void {
  if (command === 'task-select') screen.strip.step();
  if (command === 'task-stop') stopTask(screen);
  if (command === 'task-background') backgroundTask(screen);
  if (command === 'agents') screen.agents.show();
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
