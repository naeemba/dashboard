import { commandMenu, type CommandRow } from './chat-commands';
import { clampIndex, heldIndex } from './clamp-index';

// The list of slash commands over the prompt box while what is typed there is a slash and a name, or
// of files while the caret is in an @ word: a row is a command, or a file's path. CommandMenu keeps
// its name for both. The box keeps the keyboard: the view hands it Up and Down while the list is
// open, and asks it which row is picked on Tab or Enter. Which commands match is chat-commands.ts's,
// which files match chat-mentions.ts's.

export type MenuRow = CommandRow | string;

export type CommandMenu = {
  element: HTMLElement;
  // Redrawn for what is in the box now; hidden when nothing matches. Files, given while the caret is
  // in an @ word, are shown instead of the commands.
  update(text: string, commands: CommandRow[], files?: string[]): void;
  open(): boolean;
  move(by: number): void;
  picked(): MenuRow | null;
  onClick(listener: (row: MenuRow) => void): void;
};

export function createCommandMenu(): CommandMenu {
  const element = document.createElement('div');
  element.className = 'chat-menu';
  element.hidden = true;
  let rows: MenuRow[] = [];
  let selected = 0;
  let clicked: (row: MenuRow) => void = () => undefined;
  const label = (row: MenuRow) => (typeof row === 'string'
    ? { name: `@${row}`, about: '' }
    : { name: `/${row.name}${row.argumentHint ? ` ${row.argumentHint}` : ''}`, about: row.description });

  function mark(): void {
    [...element.children].forEach((line, at) => line.classList.toggle('selected', at === selected));
    element.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  return {
    element,
    update(text, commands, files) {
      const kept = rows[selected] && label(rows[selected]).name;
      rows = files ?? commandMenu(text, commands);
      selected = heldIndex(rows.map((row) => label(row).name), kept, selected);
      element.hidden = rows.length === 0;
      element.replaceChildren(...rows.map((row) => {
        const line = document.createElement('div');
        line.className = 'chat-menu-row';
        const name = document.createElement('b');
        const { name: shown, about: told } = label(row);
        name.textContent = shown;
        const about = document.createElement('span');
        about.textContent = told;
        line.append(name, about);
        line.addEventListener('click', () => clicked(row));
        return line;
      }));
      mark();
    },
    open: () => !element.hidden,
    move(by) {
      selected = clampIndex(selected + by, rows.length - 1);
      mark();
    },
    picked: () => rows[selected] ?? null,
    onClick(listener) { clicked = listener; },
  };
}
