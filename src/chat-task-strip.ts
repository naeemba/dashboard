import { piece } from './chat-foot-view';
import { taskDetail, taskOrder, type ChatTasks } from './chat-tasks';

// The strip over the box listing what Claude has running: one row per agent, workflow or background
// command, each under the one that started it, with what it has done so far and, when the session
// writes one, its one-line summary. Hidden with nothing running.
export function createTaskStrip(): { element: HTMLElement; render(tasks: ChatTasks): void } {
  const element = document.createElement('div');
  element.className = 'chat-tasks';
  element.hidden = true;
  let drawn: ChatTasks = [];
  return {
    element,
    render(tasks) {
      // Every paint asks, a streamed token included; the rows are only rebuilt when a task changed.
      if (tasks === drawn) return;
      drawn = tasks;
      element.hidden = tasks.length === 0;
      // A strip long enough to scroll keeps its place across the rebuild.
      const scrolled = element.scrollTop;
      element.replaceChildren(...taskOrder(tasks).map(({ task, depth }) => {
        const row = document.createElement('div');
        row.className = 'chat-task';
        row.style.paddingLeft = `${depth * 16}px`;
        row.append(piece('chat-task-name', task.description || task.kind), piece('chat-task-detail', taskDetail(task)));
        if (task.summary) row.append(piece('chat-task-summary', task.summary));
        return row;
      }));
      element.scrollTop = scrolled;
    },
  };
}
