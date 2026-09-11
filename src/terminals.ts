import type { Mode } from './modes';

export const TERMINAL_COUNT = 5;

// The editor is a sixth pty for the project, sitting one past the grid's five. The one place that
// says so: move the editor and every caller follows.
export const EDITOR_INDEX = TERMINAL_COUNT;

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

// `slot` and `index` all the way through: the same pair paneFromId gives back and the same pair the
// renderer's pages carry, so one id is never described in two vocabularies.
export function terminalId(slot: number, index: number): string {
  return `${slot}:${index}`;
}

export function neighbor(index: number, direction: Direction): number {
  return NEIGHBORS[direction][index];
}

// The one spelling of a pane's name. The status bar and the bell's notification both say it, and a
// second literal in either place is a name that goes stale the day the panes are renamed.
//
// A pane running an agent in a worktree says which branch it is on. The number stays in front of it —
// lose the numbering and the focus keys stop making sense — so the branch is added, never swapped in.
export function paneLabel(index: number, branch?: string): string {
  const name = `terminal ${index + 1}`;
  return branch === undefined ? name : `${name} · ${branch}`;
}

// The branch a pane is on, or undefined when it is on the project's own checkout. Kept beside
// paneLabel because it is the other half of the same sentence: the caller asks which branch, then
// asks for the label that says so.
//
// Asked by the folder the pane's shell is in, not by the pane number on a record. A record names one
// pane, and two panes can end up in one worktree: an agent exits leaving its pane in the checkout, you
// type in it, and the card is shipped again onto a different pane. By the record, the pane you are
// typing in goes back to reading "terminal 3" while sitting in the branch's folder — which is the
// wrong-checkout mistake the branch is printed to prevent. By the folder, both panes say the branch.
export function branchOfPane(
  entries: readonly { worktreePath: string; branch: string }[],
  directory: string,
): string | undefined {
  return entries.find((entry) => entry.worktreePath === directory)?.branch;
}

// The inverse of terminalId. A notification is raised for one pane and carries that pane's id back
// when it is clicked, so this is what turns the id on the wire into somewhere to land.
export function paneFromId(id: string): { slot: number; index: number } {
  const [slot, index] = id.split(':').map(Number);
  return { slot, index };
}

// Which view a pane is on. The editor is the only pane not in the grid, so landing on it means
// switching the page to nvim first — otherwise you arrive at a project showing five shells with the
// pane you were sent to nowhere on screen.
export function modeOfPane(index: number): Mode {
  return index === EDITOR_INDEX ? 'nvim' : 'terminals';
}
