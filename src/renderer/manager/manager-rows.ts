// The elements of the manager's rows: each kind of line built once, as empty cells, and written over
// on every draw after. manager-view.ts keeps one element per line from draw to draw and decides where
// each goes; this file decides what is in them.
// Every write goes through dom-writes.ts, which says why it compares first.
import { relativeAge } from '../../shared/app/age';
import { icon } from '../app/icons';
import { columnCounts } from './board-summary';
import { formatSize } from '../../shared/ship/git-worktrees';
import {
  alertSummary, canOpen, isAlerting, paneAge, stateLabel, type ManagerLine, type ManagerWorktree, type PaneSummary,
} from '../../shared/manager/manager';
import { countChips } from './manager-panels';
import { sameNode, writeHidden, writeText } from './dom-writes';
import { NEED_LABELS } from '../../shared/manager/needs-you';
import type { ManagerReads } from './manager-reads';
import { paneTokens, projectTokens, TOKEN_COLUMNS } from '../../shared/usage/usage';
import { memoryText, nearHigh } from '../../shared/processes/scope-memory';
import { dirtyLabel, worktreePaneText } from '../../shared/ship/worktree-rows';

// What a row reads off the background reads: a project's board, and whether a worktree is dirty.
type RowReads = Pick<ManagerReads, 'boardOf' | 'dirtiness'>;

// The line a pane row prints beside its name, which a pane that wants something does not get: its
// block of five is on screen underneath and ends on this very line, so printing both says it twice.
function printedLine(pane: PaneSummary): string {
  return isAlerting(pane) ? '' : pane.lastPrinted();
}

// The other half of the same either/or: the block of five a pane that wants something keeps under its
// name, and nothing at all for a pane getting on with its work. Written on every draw with the rest —
// a pane's screen moves without its state moving, so a block left out of a redraw is the question
// from four minutes ago sitting under an age that says `just now`.
function tailBlock(pane: PaneSummary): string[] {
  return isAlerting(pane) ? pane.tail() : [];
}

// A project's figure with its window named in front of it: `this week 142.9M`. Named on the row
// rather than once above the list, because a heading over the far right of a wide panel is a heading
// nobody connects to a number sixty characters away. A project nothing was spent on has empty figures,
// and the stylesheet hides the name with them.
function labelledTokens(label: string): HTMLElement {
  const figure = document.createElement('span');
  figure.className = 'manager-figure';
  const name = document.createElement('span');
  name.className = 'manager-figure-name';
  name.textContent = label;
  const tokens = document.createElement('span');
  // The class writeTokens finds a figure by, on a project row and a pane row alike.
  tokens.className = 'manager-tokens';
  figure.append(name, tokens);
  return figure;
}

// Strings rather than a project's Totals, so a project's three and a pane's one are both written by
// this — teach a fourth window to the rows and the pane row is not the one path that quietly kept its
// old writer.
function writeTokens(row: Element, figures: readonly string[]): void {
  const cells = row.querySelectorAll('.manager-tokens');
  figures.forEach((text, column) => writeText(cells[column], text));
}

// The names of the columns under a project, as a row of their own above its first terminal and above
// its first worktree. It shares the grid of the rows under it, so each name sits over its column.
// Not a line the keyboard can land on: it is not in `lines`, and it takes no click.
const GROUP_COLUMNS = {
  need: ['Needs you', 'Project', 'What', 'Waiting'],
  pane: ['Terminal', 'Last line on screen', 'Status', 'Last output', 'Tokens', 'Memory'],
  worktree: ['Worktree', 'Changes', 'Size', 'Started', 'Terminal', ''],
} as const;

export function groupHead(kind: keyof typeof GROUP_COLUMNS): HTMLElement {
  const item = document.createElement('li');
  item.className = `manager-group manager-group-${kind}`;
  item.setAttribute('role', 'presentation');
  item.append(...GROUP_COLUMNS[kind].map((text) => {
    const cell = document.createElement('span');
    cell.textContent = text;
    return cell;
  }));
  return item;
}

// The cells of each kind of row, in the order they sit on it. Filled by writeLine.
const CELLS = {
  // What it is about, which project, what it wants and how long it has waited.
  need: ['manager-need-subject', 'manager-need-project', 'manager-need-what', 'manager-age'],
  // `manager-age` is how long since the pane printed anything, which is the half of the row worth
  // reading: the text beside it can be a spinner redrawing the same line, but forty minutes is forty
  // minutes. `manager-memory` is what its systemd scopes hold, the cap named once it is near.
  pane: ['manager-name', 'manager-last-printed', 'manager-state', 'manager-age', 'manager-tokens', 'manager-memory'],
  // The card's title first, in words, and the branch after it, quieter: the branch is the title cut
  // down to a slug, so leading with it put the same sentence on the row twice, the unreadable copy
  // first. With no card, the folder's name stands where the title would.
  worktree: ['manager-worktree-names', 'manager-dirty', 'manager-size', 'manager-age', 'manager-worktree-pane'],
  // The marker is a span of its own, so that the name beside it holds a folder's name and nothing
  // else: an arrow sharing that span crosses to the far side of a Persian name and stops lining up
  // with the row above.
  project: ['manager-marker', 'manager-name', 'manager-chips', 'manager-summary', 'manager-figures'],
} as const;

const ROW_CLASS = { pane: 'manager-pane', worktree: 'manager-worktree', project: 'manager-project' } as const;

// A line's row with its cells and nothing in them yet.
export function createRow(line: ManagerLine): HTMLElement {
  const item = document.createElement('li');
  // A queue item's kind is part of its key, so a row never has to change it.
  item.className = line.kind === 'need' ? `manager-need manager-need-${line.need.kind}` : ROW_CLASS[line.kind];
  item.append(...CELLS[line.kind].map((className) => {
    const cell = document.createElement('span');
    cell.className = className;
    return cell;
  }));
  if (line.kind === 'pane') {
    // What the pane has on screen, so the question can be read from here.
    const tail = document.createElement('pre');
    tail.className = 'manager-tail';
    item.append(tail);
  }
  if (line.kind === 'worktree') {
    const title = document.createElement('span');
    title.className = 'manager-worktree-title';
    const branch = document.createElement('span');
    branch.className = 'manager-worktree-branch';
    item.querySelector('.manager-worktree-names')?.append(title, branch);
  }
  if (line.kind === 'project') {
    item.querySelector('.manager-figures')?.append(...TOKEN_COLUMNS.map(labelledTokens));
  }
  return item;
}

export function dirtyText(reads: RowReads, worktreePath: string): string {
  const { checked, dirty, unreadable } = reads.dirtiness();
  return dirtyLabel(worktreePath, checked, dirty, unreadable);
}

// A worktree no card was shipped into has no start time and no pane, so both cells are empty.
function ageText({ entry }: ManagerWorktree): string {
  // A timestamp the clock cannot read says nothing rather than "Invalid Date" — see age.ts.
  return entry ? relativeAge(entry.startedAt) ?? '' : '';
}

// Everything on a row that can change while the line keeps its key. The first draw and every one
// after, the half-minute timer's included, all write through here, so no field is drawn by one and
// forgotten by another.
export function writeLine(line: ManagerLine, item: HTMLElement, reads: RowReads): void {
  const cell = (className: string) => item.querySelector<HTMLElement>(`.${className}`);
  if (line.kind === 'need') {
    writeText(cell('manager-need-subject'), line.need.subject);
    writeText(cell('manager-need-project'), line.need.project);
    writeText(cell('manager-need-what'), NEED_LABELS[line.need.kind]);
    writeText(cell('manager-age'), paneAge(line.need.since));
    return;
  }
  if (line.kind === 'pane') return writePane(line.pane, item, cell);
  if (line.kind === 'worktree') {
    const { worktree } = line;
    writeText(cell('manager-worktree-title'), worktree.entry?.reviewing ? `reviewing · ${worktree.title}` : worktree.title);
    writeText(cell('manager-worktree-branch'), worktree.branch);
    const dirty = cell('manager-dirty');
    const { checked, dirty: dirtyPaths, unreadable } = reads.dirtiness();
    writeText(dirty, dirtyLabel(worktree.worktreePath, checked, dirtyPaths, unreadable));
    dirty?.classList.toggle('is-dirty', dirtyPaths.has(worktree.worktreePath));
    dirty?.classList.toggle('unreadable', unreadable.has(worktree.worktreePath));
    writeText(cell('manager-size'), formatSize(worktree.bytes));
    writeText(cell('manager-age'), ageText(worktree));
    writeText(cell('manager-worktree-pane'), worktree.entry ? worktreePaneText(worktree.entry) : '');
    return;
  }
  // Only a project with panes to show gets an arrow; on a quiet one there is nothing to open and a
  // marker saying otherwise would be inviting a key that does nothing.
  const marker = cell('manager-marker');
  const arrow = canOpen(line.row) ? (line.open ? 'collapse' : 'expand') : '';
  if (marker && marker.dataset.arrow !== arrow) {
    marker.dataset.arrow = arrow;
    marker.replaceChildren(...(arrow === '' ? [] : [icon(arrow)]));
  }
  writeText(cell('manager-name'), line.row.name);
  // What is on the project's board, column by column, once its board has been read. board-summary.ts
  // says which cards are counted and why Done is not.
  const board = reads.boardOf(line.row.path);
  const chips = countChips(board ? columnCounts(board) : []);
  const shown = cell('manager-chips');
  if (shown && !sameNode(shown, chips)) shown.replaceWith(chips);
  const summary = cell('manager-summary');
  writeText(summary, alertSummary(line.row.panes));
  summary?.classList.toggle('attention', line.row.panes.some(isAlerting));
  // The five-hour figure, the week's and all time, each with its name. usage.ts says what the three
  // are and what a project nothing has been spent on prints.
  writeTokens(item, projectTokens(line.row.tokens));
}

function writePane(pane: PaneSummary, item: HTMLElement, cell: (className: string) => HTMLElement | null): void {
  writeText(cell('manager-name'), pane.name);
  writeText(cell('manager-last-printed'), printedLine(pane));
  const state = cell('manager-state');
  const stateClass = `manager-state manager-${pane.state}`;
  if (state && state.className !== stateClass) state.className = stateClass;
  writeText(state, stateLabel(pane));
  // A pane that has printed nothing yet has no age and is given none.
  writeText(cell('manager-age'), paneAge(pane.lastPrintedAt));
  // Nothing at all for a pane with no agent in it, which is most of them: a column of `0` down the
  // list would say only that five shells are not Claude Code.
  writeTokens(item, [paneTokens(pane.tokens)]);
  const memory = cell('manager-memory');
  writeText(memory, memoryText(pane.memory));
  memory?.classList.toggle('manager-memory-near', nearHigh(pane.memory));
  // A pane that has printed nothing gets no empty block under it.
  const tail = cell('manager-tail');
  const block = tailBlock(pane);
  writeText(tail, block.join('\n'));
  writeHidden(tail, block.length === 0);
}
