import { relativeAge } from './age';
import { clampIndex } from './clamp-index';
import type { Project } from './projects';
import { terminalId } from './terminals';
import { isRinging, type Bell } from './waiting';

// Slots are handed out by main, one per project, counting from zero. The manager owns no ptys, so it
// takes a number no project can be given rather than a real one.
export const MANAGER_SLOT = -1;

// It sits in the tab strip where a project sits, and has none of what a project has: no folder, no
// five shells, no editor, no board. Which page is the manager is answered by its mode, not by this;
// the empty path is the second lock on the same door, because session.ts throws away a stored page
// whose path is empty, so the manager cannot reach a saved layout even if something else lets it.
export const MANAGER_PROJECT: Project = { name: 'manager', path: '', missing: false };

// The manager holds the first tab, so the earliest position a project can take is the one behind it.
const FIRST_PROJECT_POSITION = 1;

// Which pages are projects, and so what the session file remembers, what the picker can open, what you
// can drag along the tab strip, and which page is allowed to move at all. Asked of the slot, which is
// the one thing about the manager that never changes: it is the only page holding MANAGER_SLOT, and it
// holds it whatever view it is showing.
// It used to ask the mode instead, which stopped being true the moment the manager grew a board of its
// own: on that view the manager answered "project" and was written to the session file, listed in its
// own waiting list, and could be dragged along the tab strip.
export function isProjectPage(page: { slot: number }): boolean {
  return page.slot !== MANAGER_SLOT;
}

// Where a project asked for position `index` actually lands. Nothing goes in front of the manager, so a
// project dragged to the front lands second, and the two keys that ask for the front both say tab 2.
export function projectPosition(index: number): number {
  return Math.max(index, FIRST_PROJECT_POSITION);
}

// Where the window lands once everything saved is back. `saved` is -1 when the project the last run was
// left on is gone; the first project takes it, and only a launch with no project at all — `firstProject`
// of -1 too — lands on the manager.
export function landingPosition(saved: number, firstProject: number): number {
  return saved === -1 ? Math.max(firstProject, 0) : saved;
}

// Which tab the window lands on when the project you were standing on is closed. `remaining` is how many
// pages are left once it has gone: the project that slid into the closed tab takes its position, and the
// last project closed lands on the tab to its left — the manager at worst, since the manager holds tab 0
// and never leaves.
// A count rather than a last index, because a count is what the caller has in its hand after the splice
// and the subtraction is the part that is easy to get wrong. Off by one here and a close lands on a
// position past the end of the list: focusMode reads `page.mode` of nothing and throws, so the closed
// tab stays drawn, the keyboard is nowhere, and only a relaunch gets the window back.
export function positionAfterClose(closed: number, remaining: number): number {
  return clampIndex(closed, remaining - 1);
}

// What a pane somewhere else can want from you. Two things are worth crossing the app for: a pane is
// asking a question, or it has died and needs starting again.
// Asking comes first wherever they are listed: a pane waiting on an answer is the one you can do
// something about right now. The order of this array is that order, so a state added here is counted
// and printed without anyone remembering a second list.
export const ALERT_STATES = ['waiting', 'exited'] as const;

// Every pane is listed, not only the two states above, so a pane getting on with its work needs a
// state to be printed as. What it is doing is not the half you read anyway — how long it has been
// since it did it is, and `quiet` with an age beside it is how you find the pane you forgot.
export type PaneState = typeof ALERT_STATES[number] | 'quiet';

// `index` is the pane's place in its project's panes with the editor last, which is the number
// focusTerminal and modeOfPane already take. Carrying it means a row can be jumped to without anyone
// translating it back. `lastPrintedAt` is when the pane last printed anything.
// `tail` is the last few lines it printed and `lastPrinted` is only the last of them, both functions
// the whole way to the row that draws them: every pane is on the list now, but only the panes of an
// opened project are on screen, so reading them here would lay out thirty screens on every keystroke
// to print none of them. Two accessors rather than one because a row asks for one or the other, never
// both — and a whole screen laid out to keep one line of it is what the quiet rows would each pay.
export type PaneSummary = {
  index: number;
  name: string;
  state: PaneState;
  lastPrintedAt: number;
  tail(): string[];
  lastPrinted(): string;
};

// How long ago the pane last printed, in words. Empty for a pane that has printed nothing at all: a
// shell that has not drawn its prompt yet holds no timestamp, and the epoch would be read as a pane
// that has been quiet since 1970.
export function paneAge(lastPrintedAt: number, now: number = Date.now()): string {
  return lastPrintedAt === 0 ? '' : relativeAge(lastPrintedAt, now) ?? '';
}

// How much of a pane's screen a row shows. One line is not enough: an agent asks with a numbered menu,
// and the options move around with what it is asking about, so `1` read on its own means nothing. Five
// holds a question and its choices, and stops the page turning into six little terminals.
const TAIL_LINES = 5;

// The lines worth printing, newest last, from whatever the pane has on screen. Blank lines are dropped
// rather than counted — a menu that spaces its options out would otherwise push the question itself
// off the top — and what is left is still a guess: a spinner redraws one line forever, so the text can
// be older than it looks.
export function tailLines(lines: readonly string[]): string[] {
  return lines.filter(isPrinted).slice(-TAIL_LINES);
}

// Whether a row of a pane's screen has anything on it. The block of five and the single line a quiet
// row prints both stop on the same rows because both ask this: the one line is meant to be the line
// the block would end on, and two spellings of "has something on it" is how the two come to name
// different lines with nothing failing.
export function isPrinted(line: string): boolean {
  return line.trim() !== '';
}

// Whether a pane wants something from you, which is every state but quiet. Read off ALERT_STATES so a
// state added there is an alert everywhere at once. Spell it again in the view and a third state added
// later is quiet there and an alert here, with nothing failing.
export function isAlerting(pane: PaneSummary): boolean {
  return ALERT_STATES.some((state) => state === pane.state);
}

// Which rows a keystroke can be answered on. A dead pane is not asking anything — what it wants is
// Enter in the pane itself to start it again — so the key does nothing there rather than going to a
// pty nobody is reading. One place says so, so the row that takes the keystroke and the status bar
// that offers it cannot disagree.
export function takesAnswer(pane: PaneSummary): boolean {
  return pane.state === 'waiting';
}

export type ManagerRow = { slot: number; name: string; panes: PaneSummary[] };

// The shape the page needs from a project. Structural rather than the renderer's Page, so this file
// stays testable without building a terminal.
type ManagerPage = {
  project: { name: string };
  slot: number;
  // `tail` and `lastPrinted` are functions because the answer comes off a live terminal: the row asks
  // for it at the moment it draws, so no copy of a pane's screen is kept anywhere to go stale.
  panes: readonly {
    name: string; bell: Bell; exited: boolean; lastPrintedAt: number;
    tail(): string[]; lastPrinted(): string;
  }[];
};

// Dead beats asking. A shell that exits after a failed command often rings on the way out, and going
// there to answer it finds nothing to answer — what it needs is Enter to start it again.
function paneState(pane: { bell: Bell; exited: boolean }): PaneState {
  if (pane.exited) return 'exited';
  return isRinging(pane.bell) ? 'waiting' : 'quiet';
}

// One row per project, whether or not it wants anything: the page is a list of what is open, and a
// project that drops off it while quiet is a project you cannot see is fine. Every pane under it, for
// the same reason one line down: a shell nobody has touched since this morning says so by being on
// the list with an age against it, and says nothing at all by being left off.
export function managerRows(pages: readonly ManagerPage[]): ManagerRow[] {
  return pages.map((page) => ({
    slot: page.slot,
    name: page.project.name,
    panes: page.panes.map((pane, index) => ({
      index,
      name: pane.name,
      state: paneState(pane),
      lastPrintedAt: pane.lastPrintedAt,
      tail: () => pane.tail(),
      lastPrinted: () => pane.lastPrinted(),
    })),
  }));
}

// What the row says about the project beside its name. Only the panes that want something are counted:
// a project's shells are five whatever it is doing, so `5 quiet` next to every name would be five
// characters saying nothing.
export function alertSummary(panes: readonly PaneSummary[]): string {
  const parts: string[] = [];
  for (const state of ALERT_STATES) {
    const count = panes.filter((pane) => pane.state === state).length;
    if (count > 0) parts.push(`${count} ${state}`);
  }
  return parts.length === 0 ? 'quiet' : parts.join(' · ');
}

// A line on the page: a project, or one of its panes underneath it.
export type ManagerLine =
  | { kind: 'project'; row: ManagerRow; open: boolean }
  | { kind: 'pane'; slot: number; pane: PaneSummary };

// Whether a project has anything to show under it. The one place the answer lives: the arrow beside
// the name, the key that opens the row and the lines the page draws all ask this, so a row can never
// wear an open marker over nothing, or refuse a key the marker says will work.
// A project has panes whatever they are doing, so this only keeps the marker off a project whose
// window is gone — a folder that has been deleted under it, which opens with no shells at all.
export function canOpen(row: ManagerRow): boolean {
  return row.panes.length > 0;
}

// The rows flattened to what is actually on screen, which is what the selection counts and what Enter
// acts on. A project with no panes at all is drawn shut whatever `open` says, because there is nothing
// to put under it — but it is still in the set, so a project whose shells come back draws itself open
// again: a project reopened over a folder that had gone away is rebuilt into the slot it had, and the
// set is keyed by slot. That is the point: a row you asked to see stays asked for.
export function managerLines(rows: readonly ManagerRow[], open: ReadonlySet<number>): ManagerLine[] {
  return rows.flatMap((row): ManagerLine[] => {
    const isOpen = open.has(row.slot) && canOpen(row);
    if (!isOpen) return [{ kind: 'project', row, open: false }];
    return [
      { kind: 'project', row, open: true },
      ...row.panes.map((pane): ManagerLine => ({ kind: 'pane', slot: row.slot, pane })),
    ];
  });
}

// Which project a line belongs to: the row's own slot, or the slot of the project a pane row sits
// under. One place, because the key that closes a project and the key that names one both ask, and a
// third line kind added later must not have one of them still answering for two.
export function slotOfLine(line: ManagerLine): number {
  return line.kind === 'project' ? line.row.slot : line.slot;
}

// What the selection is on, as one string. A project is its slot; a pane is the same slot-and-index
// pair every pane in the app is already named by, so there is no second spelling of a pane's id.
export function lineKey(line: ManagerLine): string {
  return line.kind === 'project' ? `${slotOfLine(line)}` : terminalId(slotOfLine(line), line.pane.index);
}

