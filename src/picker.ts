import { fuzzyScore } from './fuzzy';
import { openOverlay } from './overlay';
import type { Project } from './projects';
import { isModified } from './shortcuts';

// A path opens that project, null means "open a new project", undefined means the picker was dismissed.
export type PickerChoice = string | null | undefined;

// Rows are what the keyboard walks over. Opening a new project is a row like any other, so it is reachable
// with the arrow keys instead of only the mouse.
export type Row = { name: string; detail: string; choice: string | null };

const NEW_PROJECT: Row = { name: 'Open a new project…', detail: 'choose a folder', choice: null };

// What the picker shows for a query: the matches, tightest first, then the new-project row.
export function pickerRows(projects: Project[], query: string): Row[] {
  const matched = projects
    .map((project) => ({ project, score: fuzzyScore(`${project.name} ${project.path}`, query) }))
    .filter((entry): entry is { project: Project; score: number } => entry.score !== null)
    // Sorting is stable, so projects the search cannot separate stay in the order they were given.
    .sort((first, second) => first.score - second.score)
    .map((entry) => ({ name: entry.project.name, detail: entry.project.path, choice: entry.project.path }));
  // Last and always present, so a search that matches nothing still leaves something to press Enter on.
  return [...matched, NEW_PROJECT];
}

export function openPicker(projects: Project[]): Promise<PickerChoice> {
  let rows: Row[] = [];
  let highlighted = 0;

  return new Promise<PickerChoice>((resolve) => {
    function finish(choice: PickerChoice): void {
      remove();
      resolve(choice);
    }

    const { dialog, remove } = openOverlay('picker', () => finish(undefined));
    const search = document.createElement('input');
    search.className = 'picker-search';
    search.placeholder = 'Search projects';
    const list = document.createElement('ul');
    list.className = 'picker-list';
    dialog.append(search, list);
    search.focus();

    function render(): void {
      rows = pickerRows(projects, search.value);
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
      // Nothing else in the dialog is focusable, so Tab would drop focus into the pane behind the
      // overlay — and so would Shift+Tab, which is why this comes before the modified keys are
      // handed back.
      if (event.key === 'Tab') return event.preventDefault();
      if (isModified(event)) return;
      switch (event.key) {
        case 'Escape': return finish(undefined);
        case 'Enter': return finish(rows[highlighted].choice);
        case 'ArrowDown': event.preventDefault(); return move(1);
        case 'ArrowUp': event.preventDefault(); return move(-1);
      }
    });
    render();
  });
}
