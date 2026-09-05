import { fuzzyScore } from './fuzzy';
import type { Project } from './projects';

// A path opens that project, null means "open a new project", undefined means the picker was dismissed.
export type PickerChoice = string | null | undefined;

// Rows are what the keyboard walks over. Opening a new project is a row like any other, so it is reachable
// with the arrow keys instead of only the mouse.
type Row = { name: string; detail: string; choice: string | null };

const NEW_PROJECT: Row = { name: 'Open a new project…', detail: 'choose a folder', choice: null };

export function openPicker(projects: Project[]): Promise<PickerChoice> {
  const overlay = document.createElement('div');
  overlay.className = 'picker';
  const dialog = document.createElement('div');
  dialog.className = 'picker-dialog';
  const search = document.createElement('input');
  search.className = 'picker-search';
  search.placeholder = 'Search projects';
  const list = document.createElement('ul');
  list.className = 'picker-list';
  dialog.append(search, list);
  overlay.append(dialog);
  document.body.append(overlay);
  search.focus();

  let rows: Row[] = [];
  let highlighted = 0;

  return new Promise<PickerChoice>((resolve) => {
    function finish(choice: PickerChoice): void {
      overlay.remove();
      resolve(choice);
    }

    function render(): void {
      rows = projects
        .map((project) => ({
          project,
          score: fuzzyScore(`${project.name} ${project.path}`, search.value) ?? Infinity,
        }))
        .filter((entry) => entry.score < Infinity)
        // Sorting is stable, so projects the search cannot separate stay in the order they were given.
        .sort((first, second) => first.score - second.score)
        .map((entry) => ({ name: entry.project.name, detail: entry.project.path, choice: entry.project.path }));
      // Last and always present, so a search that matches nothing still leaves something to press Enter on.
      rows.push(NEW_PROJECT);
      highlighted = Math.min(highlighted, rows.length - 1);
      list.replaceChildren(...rows.map((row, index) => {
        const item = document.createElement('li');
        if (index === highlighted) item.classList.add('highlighted');
        if (row.choice === null) item.classList.add('picker-new');
        const name = document.createElement('span');
        name.className = 'picker-name';
        name.textContent = row.name;
        const detail = document.createElement('span');
        detail.className = 'picker-detail';
        detail.textContent = row.detail;
        item.append(name, detail);
        item.addEventListener('click', () => finish(row.choice));
        return item;
      }));
      list.children[highlighted]?.scrollIntoView({ block: 'nearest' });
    }

    function move(step: number): void {
      highlighted = (highlighted + step + rows.length) % rows.length;
      render();
    }

    search.addEventListener('input', () => {
      highlighted = 0;
      render();
    });
    search.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'Escape': return finish(undefined);
        case 'Enter': return finish(rows[highlighted].choice);
        case 'ArrowDown': event.preventDefault(); return move(1);
        case 'ArrowUp': event.preventDefault(); return move(-1);
      }
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(undefined);
    });

    render();
  });
}
