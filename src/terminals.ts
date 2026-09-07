import type { Mode } from './modes';

export const TERMINAL_COUNT = 5;

export type Direction = 'left' | 'right' | 'up' | 'down';

// Matches the grid in index.css: two on top (0 1), three on bottom (2 3 4).
// Edges stay put; up/down pick the nearest pane by centre, so the bottom-middle pane (3) is only
// reachable sideways and a move up does not always undo a move down.
const NEIGHBORS: Record<Direction, number[]> = {
  left: [0, 0, 2, 2, 3],
  right: [1, 1, 3, 4, 4],
  up: [0, 1, 0, 1, 1],
  down: [2, 4, 2, 3, 4],
};

export function terminalId(projectIndex: number, terminalIndex: number): string {
  return `${projectIndex}:${terminalIndex}`;
}

export function neighbor(index: number, direction: Direction): number {
  return NEIGHBORS[direction][index];
}

// The one spelling of a pane's name. The status bar and the bell's notification both say it, and a
// second literal in either place is a name that goes stale the day the panes are renamed.
export function paneLabel(index: number): string {
  return `terminal ${index + 1}`;
}

// The inverse of terminalId. A notification is raised for one pane and carries that pane's id back
// when it is clicked, so this is what turns the id on the wire into somewhere to land.
export function paneFromId(id: string): { slot: number; index: number } {
  const [slot, index] = id.split(':').map(Number);
  return { slot, index };
}

// Which view a pane is on. The editor sits one past the grid and is the only pane not in it, so
// landing on the editor means switching the page to nvim first — otherwise you arrive at a project
// showing five shells with the pane you were sent to nowhere on screen.
export function modeOfPane(index: number): Mode {
  return index === TERMINAL_COUNT ? 'nvim' : 'terminals';
}
