import { followAfter, readTaskOutput, type FinishedTask, type OutputRead, type TaskOutputRead } from '../../shared/chat/chat-agents';
import type { ChatTask } from '../../shared/chat/chat-tasks';
import { failureText } from '../../shared/errors/failure';
import { viewerOverlay } from '../app/overlay';
import { nearBottom } from './chat-scroll';

// How often the open viewer asks again while its task runs.
const FOLLOW_MS = 1000;

export type OutputPorts = {
  read(): Promise<TaskOutputRead>;
  running(): boolean;
  refused(reason: string): void;
  failed(message: string): void;
  closed(): void;
};

// A background shell command's or a Monitor's output over the screen, the end the session keeps, asked
// again each second while the task runs so it follows the command with its last lines in view, and
// once more after it ends. Escape closes it. What one read shows and whether to ask again are
// readTaskOutput's and followAfter's; this keeps the sheet and the timer.
export async function openTaskOutput(task: ChatTask | FinishedTask, ports: OutputPorts): Promise<void> {
  const name = task.description || task.kind;
  const next = () => readTaskOutput(name, ports.read, ports.running);

  let first: OutputRead;
  try {
    first = await next();
  } catch (error) {
    return ports.failed(`${name}'s output not read: ${failureText(error)}`);
  }
  if (first.shown.kind === 'refused') return ports.refused(first.shown.reason);

  const sheet = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'chat-agent-title';
  title.textContent = `${name} · ${task.kind}`;
  const output = document.createElement('pre');
  output.className = 'chat-task-output';
  sheet.append(title, output);

  // A quiet task reads the same each second; only a change is drawn, so the sheet is not laid out again.
  function draw(text: string): void {
    if (text === output.textContent) return;
    const box = sheet.parentElement;
    const stick = !box || nearBottom(box);
    output.textContent = text;
    if (stick && box) box.scrollTop = box.scrollHeight;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let open = true;
  viewerOverlay('chat-agent', sheet, {
    closed: () => {
      open = false;
      clearTimeout(timer);
      ports.closed();
    },
  });
  draw(first.shown.text);

  // A read that fails once the viewer is open keeps what it shows and stops following.
  function follow(again: boolean): void {
    if (!again) return;
    timer = setTimeout(() => {
      next().then((read) => {
        if (!open) return;
        const step = followAfter(read);
        if (step.draw !== null) draw(step.draw);
        follow(step.again);
      }, () => undefined);
    }, FOLLOW_MS);
  }
  follow(first.running);
}
