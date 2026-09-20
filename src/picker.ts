import { fuzzyScore } from './fuzzy';
import { searchOverlay, type SearchRow } from './overlay';
import type { Project } from './projects';

// A path opens that project, null means "open a new project", undefined means the picker was dismissed.
export type PickerChoice = string | null | undefined;

// Rows are what the keyboard walks over. Opening a new project is a row like any other, so it is reachable
// with the arrow keys instead of only the mouse.
export type Row = SearchRow<string | null>;

const NEW_PROJECT: Row = {
  name: 'Open a new project…',
  detail: 'choose a folder',
  choice: null,
  className: 'picker-new',
};

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
  // No empty line: the new-project row is always there, so this list is never empty.
  return searchOverlay({
    name: 'picker',
    placeholder: 'Search projects',
    rows: (query) => pickerRows(projects, query),
  });
}
