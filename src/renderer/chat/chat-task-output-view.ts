import { taskOutputShown, type FinishedTask, type TaskOutputRead } from '../../shared/chat/chat-agents';
import type { ChatTask } from '../../shared/chat/chat-tasks';
import { failureText } from '../../shared/errors/failure';
import { viewerOverlay } from '../app/overlay';

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
// once more after it ends. Escape closes it. What one read shows, or why not, is taskOutputShown's.
export async function openTaskOutput(task: ChatTask | FinishedTask, ports: OutputPorts): Promise<void> {
  const name = task.description || task.kind;
  async function next(): Promise<{ running: boolean; shown: ReturnType<typeof taskOutputShown> }> {
    // Asked before the read, so the read after the task ends is the last one.
    const running = ports.running();
    return { running, shown: taskOutputShown(name, await ports.read(), running) };
  }

  let first: Awaited<ReturnType<typeof next>>;
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
    const stick = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
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

  // A read that fails or is refused once the viewer is open keeps what it shows and stops following.
  function follow(running: boolean): void {
    if (!running) return;
    timer = setTimeout(() => {
      next().then(({ running: still, shown }) => {
        if (!open || shown.kind === 'refused') return;
        draw(shown.text);
        follow(still);
      }, () => undefined);
    }, FOLLOW_MS);
  }
  follow(first.running);
}
