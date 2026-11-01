import { fuzzyScore, type SearchRow } from '../../shared/app/fuzzy';
import { searchOverlay } from './overlay';
import type { Project } from '../../shared/app/bridge';

// What the picker settles on. Opening carries a path, or null for "a new project"; the host choices
// carry the address they act on; undefined means the picker was dismissed.
export type PickerChoice =
  | { kind: 'open'; path: string | null }
  | { kind: 'connect' }
  | { kind: 'reconnect'; address: string }
  | { kind: 'disconnect'; address: string }
  | undefined;
export type PickerState = { connectedTo: string | null; lastAddress: string };

// Rows are what the keyboard walks over. Opening a new project and joining a host are rows like any
// other, so they are reachable with the arrow keys instead of only the mouse.
export type Row = SearchRow<Exclude<PickerChoice, undefined>>;

const NEW_PROJECT: Row = {
  name: 'Open a new project…',
  detail: 'choose a folder',
  choice: { kind: 'open', path: null },
  className: 'picker-new',
};
const CONNECT: Row = {
  name: 'Connect to a host…',
  detail: 'another Dashboard, as a second screen',
  choice: { kind: 'connect' },
  className: 'picker-new',
};

// One host at a time: connected, the only host row is the way out.
function hostRows(state: PickerState): Row[] {
  if (state.connectedTo !== null) {
    return [{
      name: `Disconnect from ${state.connectedTo}`,
      detail: "back to this machine's projects",
      choice: { kind: 'disconnect', address: state.connectedTo },
      className: 'picker-new',
    }];
  }
  if (state.lastAddress === '') return [CONNECT];
  return [{
    name: `Reconnect to ${state.lastAddress}`,
    detail: 'the host you last connected to',
    choice: { kind: 'reconnect', address: state.lastAddress },
    className: 'picker-new',
  }, CONNECT];
}

// What the picker shows for a query: the matches, tightest first, then the rows that are not projects.
// With nothing typed, the host you last joined leads instead, so Ctrl+S and Enter takes you back to it;
// a search still leads with its matches, so typing a name and pressing Enter opens that project.
export function pickerRows(projects: Project[], query: string, state: PickerState): Row[] {
  const matched: Row[] = projects
    .map((project) => ({ project, score: fuzzyScore(`${project.name} ${project.path}`, query) }))
    .filter((entry): entry is { project: Project; score: number } => entry.score !== null)
    // Sorting is stable, so projects the search cannot separate stay in the order they were given.
    .sort((first, second) => first.score - second.score)
    .map((entry) => ({
      name: entry.project.name,
      detail: entry.project.path,
      choice: { kind: 'open', path: entry.project.path },
    }));
  // Always present, so a search that matches nothing still leaves something to press Enter on.
  const hosts = hostRows(state);
  if (query === '' && hosts[0].choice.kind === 'reconnect') return [hosts[0], ...matched, NEW_PROJECT, ...hosts.slice(1)];
  return [...matched, NEW_PROJECT, ...hosts];
}

function glyphFor(row: Row): 'folderPlus' | 'folder' | 'plug' {
  if (row.choice.kind !== 'open') return 'plug';
  return row.choice.path === null ? 'folderPlus' : 'folder';
}

export function openPicker(projects: Project[], state: PickerState): Promise<PickerChoice> {
  // No empty line: the new-project row is always there, so this list is never empty.
  return searchOverlay({
    name: 'picker',
    placeholder: 'Search projects',
    rows: (query) => pickerRows(projects, query, state),
    glyph: glyphFor,
  });
}
