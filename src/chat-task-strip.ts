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
      element.replaceChildren(...taskOrder(tasks).map((task) => {
        const row = document.createElement('div');
        row.className = 'chat-task';
        row.style.paddingLeft = `${task.depth * 16}px`;
        const name = document.createElement('span');
        name.className = 'chat-task-name';
        name.textContent = task.description || task.kind;
        const detail = document.createElement('span');
        detail.className = 'chat-task-detail';
        detail.textContent = taskDetail(task);
        row.append(name, detail);
        if (task.summary) {
          const summary = document.createElement('div');
          summary.className = 'chat-task-summary';
          summary.textContent = task.summary;
          row.append(summary);
        }
        return row;
      }));
    },
  };
}
