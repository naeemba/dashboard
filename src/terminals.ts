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

// Every pane of one project, in the order they were made: the grid's five and the editor one past
// them. Main kills a project's panes by this list and the renderer lets them go by it, and both would
// otherwise walk the layout themselves, which is what EDITOR_INDEX above exists to stop. The spawn
// keeps its own loop: the editor is registered without being started, so it is not one of the six
// treated alike.
export function paneIds(slot: number): string[] {
  return Array.from({ length: EDITOR_INDEX + 1 }, (_value, index) => terminalId(slot, index));
}

export function neighbor(index: number, direction: Direction): number {
  return NEIGHBORS[direction][index];
}

// The one spelling of a pane's name. The status bar and the bell's notification both say it, and a
// second literal in either place is a name that goes stale the day the panes are renamed.
//
// A pane running an agent in a worktree says which branch it is on, and a pane that has been named
// says its name. The number stays in front of both — lose the numbering and the focus keys stop
// making sense — so each is added, never swapped in.
//
// The name goes last of the three. The status bar is one line and the end of it is what a narrow
// window drops first, so the order is what we can least afford to lose, first: which pane the
// keyboard is in, then which checkout it is looking at, then what someone called it.
// The editor is asked for by the same number every other pane is, because everything that lists a
// project's panes walks paneIds and gets it last. `terminal 6` would name a pane that is not in the
// grid and that no focus key reaches.
export function paneLabel(index: number, branch?: string, name?: string): string {
  const base = index === EDITOR_INDEX ? 'nvim' : `terminal ${index + 1}`;
  return [base, branch, name].filter((part) => part !== undefined).join(' · ');
}

const NAME_LIMIT = 40;

// What a pane is called, out of the two things that can call it something. A name you typed wins: a
// title is a hint and nothing more, because the shell rewrites it on every prompt — take it over a
// typed name and the name you chose is gone by the next `ls`.
//
// Blank is not a name. Clearing the typed name is how you go back to following the title, and a
// program is free to set the title to nothing, so neither may leave a pane reading `terminal 3 · `.
// The trim happens here, once, rather than at each of the three ends that store one.
//
// Cut to a length the two places a name is drawn can hold. A title is whatever the program in the
// pane printed — a zsh theme that titles the window with the full path, an agent saying what it is
// working on — and both the status bar's one line and the manager's row are flex rows that cannot
// shrink below their text. A hundred-character title there pushes the right end off the window, and
// the right end of the status bar is the part that says which pane is ringing. Cut once here, where
// every name arrives, rather than in each of them.
export function paneName(pane: { typedName?: string; title?: string }): string | undefined {
  const name = pane.typedName?.trim() || pane.title?.trim() || undefined;
  if (name === undefined || name.length <= NAME_LIMIT) return name;
  return `${[...name].slice(0, NAME_LIMIT - 1).join('').trimEnd()}…`;
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

// The size a pty is born at. Main spawns every pty and cannot see the window, so the only size it has
// is the last one the pane's terminal reported — a pane is measured in the renderer and says so on
// `pty:resize`, and that is the same message that resizes the live pty, so the record and the pty can
// never be two different numbers.
//
// The fallback is xterm's own starting size, not a guess: a pane that has never reported is a terminal
// nobody has measured yet, and its renderer half is 80x24 too until the first fit. Get this wrong and
// the two disagree from the first byte.
//
// What it costs to skip the record and spawn at the fallback anyway: ship a card into a pane that is
// already on screen at 160 columns, and the agent draws its prompt box half the width of the pane and
// stays there — nothing has changed on the renderer's side, so no resize is ever sent to correct it.
export interface PaneSize {
  cols: number;
  rows: number;
}

export const DEFAULT_PANE_SIZE: PaneSize = { cols: 80, rows: 24 };

export function sizeOfPane(sizes: ReadonlyMap<string, PaneSize>, id: string): PaneSize {
  return sizes.get(id) ?? DEFAULT_PANE_SIZE;
}

// Which view a pane is on. The editor is the only pane not in the grid, so landing on it means
// switching the page to nvim first — otherwise you arrive at a project showing five shells with the
// pane you were sent to nowhere on screen.
export function modeOfPane(index: number): Mode {
  return index === EDITOR_INDEX ? 'nvim' : 'terminals';
}

// Whether asking for nvim has to start it. Two ways in — arriving on the nvim screen, and the
// scrollback key, which needs a live nvim to hand a file to — and the question belongs here rather
// than at each of them: with the condition left to the callers, the second one wrote its own and got a
// different one, and the third would have copied whichever it read first.
//
// What the different one looked like: quit nvim, press the scrollback key, and it waits fifteen
// seconds for a socket nothing is going to create before telling you nvim did not start. So a pane
// that has exited starts again, which is also what the nvim screen does when you come back to it.
export function startsEditor(editor: { started: boolean; exited: boolean }): boolean {
  return !editor.started || editor.exited;
}
