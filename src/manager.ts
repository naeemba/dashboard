import { clampIndex } from './clamp-index';
import type { Mode } from './modes';
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
// can drag along the tab strip, and which page is allowed to move at all. Asked of the mode rather than
// of the project behind it: the manager is the only page with that mode — setMode only ever picks a view
// a page has, and it is the only page with that view — and it is also the only page with no project
// behind it.
export function isProjectPage(page: { mode: Mode }): boolean {
  return page.mode !== 'manager';
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

// What a pane somewhere else can want from you. Two things are worth crossing the app for: a pane is
// asking a question, or it has died and needs starting again. Everything else is a pane getting on
// with its work, and the manager says nothing about it.
// Asking comes first wherever they are listed: a pane waiting on an answer is the one you can do
// something about right now. The order of this array is that order, so a state added here is counted
// and printed without anyone remembering a second list.
export const PANE_STATES = ['waiting', 'exited'] as const;
export type PaneState = typeof PANE_STATES[number];

// `index` is the pane's place in its project's panes with the editor last, which is the number
// focusTerminal and modeOfPane already take. Carrying it means a row can be jumped to without anyone
// translating it back. `tail` is the last few lines that pane printed, so the row says what is being
// asked rather than only that something is.
export type PaneAlert = { index: number; name: string; state: PaneState; tail: string[] };

// How much of a pane's screen a row shows. One line is not enough: an agent asks with a numbered menu,
// and the options move around with what it is asking about, so `1` read on its own means nothing. Five
// holds a question and its choices, and stops the page turning into six little terminals.
const TAIL_LINES = 5;

// The lines worth printing, newest last, from whatever the pane has on screen. Blank lines are dropped
// rather than counted — a menu that spaces its options out would otherwise push the question itself
// off the top — and what is left is still a guess: a spinner redraws one line forever, so the text can
// be older than it looks.
export function tailLines(lines: readonly string[]): string[] {
  return lines.filter((line) => line.trim() !== '').slice(-TAIL_LINES);
}

// Which rows a keystroke can be answered on. A dead pane is not asking anything — what it wants is
// Enter in the pane itself to start it again — so the key does nothing there rather than going to a
// pty nobody is reading. One place says so, so the row that takes the keystroke and the status bar
// that offers it cannot disagree.
export function takesAnswer(alert: PaneAlert): boolean {
  return alert.state === 'waiting';
}

export type ManagerRow = { slot: number; name: string; alerts: PaneAlert[] };

// The shape the page needs from a project. Structural rather than the renderer's Page, so this file
// stays testable without building a terminal.
type ManagerPage = {
  project: { name: string };
  slot: number;
  // `tail` is a function because it is only worth reading for a pane that wants something: the answer
  // comes off a live terminal, and the quiet panes are most of them.
  panes: readonly { name: string; bell: Bell; exited: boolean; tail(): string[] }[];
};

// Dead beats asking. A shell that exits after a failed command often rings on the way out, and going
// there to answer it finds nothing to answer — what it needs is Enter to start it again.
function paneState(pane: { bell: Bell; exited: boolean }): PaneState | null {
  if (pane.exited) return 'exited';
  return isRinging(pane.bell) ? 'waiting' : null;
}

// One row per project, whether or not it wants anything: the page is a list of what is open, and a
// project that drops off it while quiet is a project you cannot see is fine.
export function managerRows(pages: readonly ManagerPage[]): ManagerRow[] {
  return pages.map((page) => ({
    slot: page.slot,
    name: page.project.name,
    alerts: page.panes.flatMap((pane, index) => {
      const state = paneState(pane);
      return state === null ? [] : [{ index, name: pane.name, state, tail: pane.tail() }];
    }),
  }));
}

// What the row says about the project beside its name.
export function alertSummary(alerts: readonly PaneAlert[]): string {
  const parts: string[] = [];
  for (const state of PANE_STATES) {
    const count = alerts.filter((alert) => alert.state === state).length;
    if (count > 0) parts.push(`${count} ${state}`);
  }
  return parts.length === 0 ? 'quiet' : parts.join(' · ');
}

// A line on the page: a project, or one of its panes underneath it.
export type ManagerLine =
  | { kind: 'project'; row: ManagerRow; open: boolean }
  | { kind: 'pane'; slot: number; alert: PaneAlert };

// Whether a project has anything to show under it. The one place the answer lives: the arrow beside
// the name, the key that opens the row and the lines the page draws all ask this, so a row can never
// wear an open marker over nothing, or refuse a key the marker says will work.
export function canOpen(row: ManagerRow): boolean {
  return row.alerts.length > 0;
}

// The rows flattened to what is actually on screen, which is what the selection counts and what Enter
// acts on. A quiet project is drawn shut whatever `open` says, because there is nothing to put under
// it — but it is still in the set, so a project you opened and never shut comes back open by itself
// the next time one of its panes rings. That is the point: a row you asked to see stays asked for.
export function managerLines(rows: readonly ManagerRow[], open: ReadonlySet<number>): ManagerLine[] {
  return rows.flatMap((row): ManagerLine[] => {
    const isOpen = open.has(row.slot) && canOpen(row);
    if (!isOpen) return [{ kind: 'project', row, open: false }];
    return [
      { kind: 'project', row, open: true },
      ...row.alerts.map((alert): ManagerLine => ({ kind: 'pane', slot: row.slot, alert })),
    ];
  });
}

// What the selection is on, as one string. A project is its slot; a pane is the same slot-and-index
// pair every pane in the app is already named by, so there is no second spelling of a pane's id.
export function lineKey(line: ManagerLine): string {
  return line.kind === 'project' ? `${line.row.slot}` : terminalId(line.slot, line.alert.index);
}

// No row under the highlight, which is where answering a pane leaves it: that row is on its way out
// of the list, and the row sliding up into its place belongs to another project. Held rather than
// clamped back onto a row, so the next character typed is dropped instead of landing in a shell you
// were not aiming at.
export const NOTHING_SELECTED = -1;

// Where the selection lands once the page has been redrawn: on the same line it was on, wherever a
// pane that has just started asking has pushed it to. A line that is gone — the pane stopped asking,
// the project was closed — leaves the selection at the position it held, not back at the top.
export function selectedLine(lines: readonly ManagerLine[], key: string, previous: number): number {
  if (previous === NOTHING_SELECTED) return NOTHING_SELECTED;
  const found = lines.findIndex((line) => lineKey(line) === key);
  return found === -1 ? clampIndex(previous, lines.length - 1) : found;
}

// Where an arrow lands. The list does not wrap: holding Down stops on the last line rather than
// carrying you back to the first project, which would be a jump you did not ask for.
// With nothing selected — which is where answering a pane leaves you — the move starts from the gap
// that row left, so Down takes whatever slid up into its place and Up the row above it. Counting from
// the empty selection instead would floor at the top, and answering the last pane on the page would
// send you all the way back to the first project.
export function nextSelection(
  selected: number,
  answeredAt: number,
  direction: 'up' | 'down',
  count: number,
): number {
  const down = direction === 'down';
  const from = selected === NOTHING_SELECTED ? answeredAt - (down ? 1 : 0) : selected;
  return clampIndex(from + (down ? 1 : -1), count - 1);
}
