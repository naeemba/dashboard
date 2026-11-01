import { piece } from './chat-foot-view';
import { keptSelection, nextTaskSelection, pickedTask, taskDetail, taskOrder, type ChatTask, type ChatTasks } from '../../shared/chat/chat-tasks';

// The strip over the box listing what Claude has running: one row per agent, workflow or background
// command, each under the one that started it, with what it has done so far and, when the session
// writes one, its one-line summary. Hidden with nothing running. The task key picks a row, which the
// stop and background keys act on; a click picks the row it lands on.
export type TaskStrip = {
  element: HTMLElement;
  render(tasks: ChatTasks): void;
  step(): void;
  // The picked task, as pickedTask in chat-tasks.ts decides it.
  picked(): ChatTask | 'ended' | null;
};

export function createTaskStrip(): TaskStrip {
  const element = document.createElement('div');
  element.className = 'chat-tasks';
  element.hidden = true;
  let drawn: ChatTasks = [];
  let selected: string | null = null;

  function mark(): void {
    for (const row of element.querySelectorAll<HTMLElement>('.chat-task')) row.classList.toggle('selected', row.dataset.task === selected);
    element.querySelector('.chat-task.selected')?.scrollIntoView({ block: 'nearest' });
  }

  element.addEventListener('click', (event) => {
    const row = (event.target as Element).closest<HTMLElement>('.chat-task');
    if (!row) return;
    selected = row.dataset.task ?? null;
    mark();
  });

  function draw(): void {
    element.hidden = drawn.length === 0;
    // A strip long enough to scroll keeps its place across the rebuild.
    const scrolled = element.scrollTop;
    element.replaceChildren(...taskOrder(drawn).map(({ task, depth }) => {
      const row = document.createElement('div');
      row.className = 'chat-task';
      row.dataset.task = task.id;
      row.classList.toggle('selected', task.id === selected);
      row.style.paddingLeft = `${depth * 16}px`;
      row.append(piece('chat-task-name', task.description || task.kind), piece('chat-task-detail', taskDetail(task)));
      if (task.summary) row.append(piece('chat-task-summary', task.summary));
      return row;
    }));
    element.scrollTop = scrolled;
  }

  return {
    element,
    render(tasks) {
      // Every paint asks, a streamed token included; the rows are only rebuilt when a task changed.
      if (tasks === drawn) return;
      drawn = tasks;
      selected = keptSelection(tasks, selected);
      draw();
    },
    step() {
      selected = nextTaskSelection(drawn, selected);
      mark();
    },
    picked: () => pickedTask(drawn, selected),
  };
}
