import type { Mode } from './modes';

// A project's terminals are its main session and the worker panes beside it. The main session is
// always pane 0, full height on the left; workers are numbered from 1 and come and go, so a project has
// as many as it has been given and the numbers of the ones still open never move. A worker that closes
// leaves its number free for the next one, which is what keeps the labels short.
export const MAIN_INDEX = 0;

// The editor and the Claude screen are numbered below the terminals rather than after them: workers
// have no last number, so anything counted from the end of them would one day be a worker's. The one
// place that says so: move either and every caller follows.
export const EDITOR_INDEX = -1;

// The Claude screen. It is not a pty, so main never spawns or kills anything by it; it is a number
// only so a notification it raises can name it.
export const CHAT_INDEX = -2;

export type Direction = 'left' | 'right' | 'up' | 'down';

// `slot` and `index` all the way through: the same pair paneFromId gives back and the same pair the
// renderer's pages carry, so one id is never described in two vocabularies.
export function terminalId(slot: number, index: number): string {
  return `${slot}:${index}`;
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
// The editor and the main session have names rather than numbers: neither is one of the workers, and
// `terminal 1` beside a column of workers would read as the first of them.
export function paneLabel(index: number, branch?: string, name?: string): string {
  const base = index === EDITOR_INDEX ? 'nvim' : index === MAIN_INDEX ? 'main' : `terminal ${index + 1}`;
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
export type PaneSize = {
  cols: number;
  rows: number;
};

export const DEFAULT_PANE_SIZE: PaneSize = { cols: 80, rows: 24 };

export function sizeOfPane(sizes: { sizeOf(id: string): PaneSize | undefined }, id: string): PaneSize {
  return sizes.sizeOf(id) ?? DEFAULT_PANE_SIZE;
}

// Which view a pane is on. The editor is the only pane not in the grid, so landing on it means
// switching the page to nvim first — otherwise you arrive at a project showing five shells with the
// pane you were sent to nowhere on screen.
export function modeOfPane(index: number): Mode {
  if (index === CHAT_INDEX) return 'claude';
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
