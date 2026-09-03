export const TERMINAL_COUNT = 5;

export type Direction = 'left' | 'right' | 'up' | 'down';

// Matches the grid in index.css: two on top (0 1), three on bottom (2 3 4).
// Edges stay put; up/down pick the pane under the same horizontal position.
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
