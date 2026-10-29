import { commandMenu, type CommandRow } from './chat-commands';
import { clampIndex } from './clamp-index';

// The list of slash commands over the prompt box while what is typed there is a slash and a name.
// The box keeps the keyboard: the view hands it Up and Down while the list is open, and asks it which
// row is picked on Tab or Enter. Which rows match is chat-commands.ts's.

export type CommandMenu = {
  element: HTMLElement;
  // Redrawn for what is in the box now. False when the list has nothing to show and is hidden.
  update(text: string, commands: CommandRow[]): boolean;
  move(by: number): void;
  picked(): CommandRow | null;
  onClick(listener: (row: CommandRow) => void): void;
};

export function createCommandMenu(): CommandMenu {
  const element = document.createElement('div');
  element.className = 'chat-menu';
  element.hidden = true;
  let rows: CommandRow[] = [];
  let selected = 0;
  let clicked: (row: CommandRow) => void = () => undefined;

  function mark(): void {
    [...element.children].forEach((line, at) => line.classList.toggle('selected', at === selected));
    element.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  return {
    element,
    update(text, commands) {
      const next = commandMenu(text, commands);
      const kept = rows[selected]?.name;
      rows = next;
      selected = Math.max(0, rows.findIndex((row) => row.name === kept));
      element.hidden = rows.length === 0;
      element.replaceChildren(...rows.map((row) => {
        const line = document.createElement('div');
        line.className = 'chat-menu-row';
        const name = document.createElement('b');
        name.textContent = `/${row.name}${row.argumentHint ? ` ${row.argumentHint}` : ''}`;
        const about = document.createElement('span');
        about.textContent = row.description;
        line.append(name, about);
        line.addEventListener('click', () => clicked(row));
        return line;
      }));
      mark();
      return rows.length > 0;
    },
    move(by) {
      selected = clampIndex(selected + by, rows.length - 1);
      mark();
    },
    picked: () => rows[selected] ?? null,
    onClick(listener) { clicked = listener; },
  };
}
