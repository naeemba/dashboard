import type { Action } from './actions';
import { relativeAge } from './age';
import { columnCounts, recentActivity } from './board-summary';
import { clampIndex, heldIndex } from './clamp-index';
import {
  alertSummary, canOpen, isAlerting, lineKey, managerLines, paneAge, removableWorktree, slotOfLine, stateLabel,
  takesAnswer, type ManagerLine, type ManagerRow, type PaneSummary,
} from './manager';
import { countChips, createActivity, createOverview } from './manager-panels';
import type { ManagerReads } from './manager-reads';
import { isBareCharacter } from './shortcuts';
import { paneTokens, projectTokens, TOKEN_COLUMNS } from './usage';
import { APP_VERSION } from './version';
import { dirtyLabel, worktreePaneText } from './worktree-rows';
import type { WorktreeEntry } from './worktree-store';
import type { JumpToWorktree } from './worktree-view';

export type ManagerOptions = {
  // Where a pane row lands you: the project holding that slot, and the pane at that index.
  onJump(slot: number, index: number): void;
  // One keystroke, straight to that pane's shell, without going there.
  onAnswer(slot: number, index: number, key: string): void;
  // Closes the project holding that slot, or says why it cannot. The view picks the project; what
  // closing costs, and what stops it, is the renderer's and close-project.ts's to answer.
  onClose(slot: number): void;
  // Redraws the page. The rows are the renderer's, so the view asks for them back rather than keeping
  // its own copy; the status bar, which names what the selection is on, is redrawn by the same call.
  onChanged(): void;
  // Enter on a worktree row: lands on its pane, or hands back the sentence saying why it could not —
  // the same answer the worktree dialog gets.
  onJumpWorktree: JumpToWorktree;
  // The removal key on a worktree row, and its button. What is asked, and what is forced, is
  // worktree-removal.ts's.
  onRemoveWorktree(entry: WorktreeEntry): void;
  // A sentence for the status bar, or '' to take back the one this view put there.
  onError(message: string): void;
  // What a key is bound to now, so the status bar names the removal key in force.
  binding(actionName: string): string;
  // Every open project's board and which worktrees are dirty, read in the background.
  reads: ManagerReads;
};

export type ManagerView = {
  element: HTMLElement;
  // The rows are read from the renderer's pages, which are the live ones — the page holds none of its
  // own, so a bell that arrives while you are looking at it shows up on the next redraw.
  render(rows: readonly ManagerRow[]): void;
  // The in-place redraw, asked for by the timer and by a token sweep: the fields that change while the
  // list itself does not — on a pane row the line it last printed, how long ago that was, its figure,
  // and the block of screen under a row that is asking you something; on a project row its figures.
  refreshRows(rows: readonly ManagerRow[]): void;
  statusLabel(): string;
  // The manager's own keys, found by the window's one lookup and handed here. Same arrangement the
  // board has, and for the same reason: one place decides what every key on every screen does.
  runAction(action: Action): void;
};

// What the row says instead of a pane list when the project has nothing to show.
const SHUT = '▸';
const OPEN = '▾';

// The line a pane row prints beside its name, which a pane that wants something does not get: its
// block of five is on screen underneath and ends on this very line, so printing both says it twice.
// One place, because the first draw and the timer's redraw both ask.
function printedLine(pane: PaneSummary): string {
  return isAlerting(pane) ? '' : pane.lastPrinted();
}

// The other half of the same either/or: the block of five a pane that wants something keeps under its
// name, and nothing at all for a pane getting on with its work. One place, because the first draw and
// the timer's redraw both ask — a pane's screen moves without its state moving, so a block left out of
// the redraw is the question from four minutes ago sitting under an age that says `just now`.
function tailBlock(pane: PaneSummary): string[] {
  return isAlerting(pane) ? pane.tail() : [];
}

// One token figure. A project's three and a pane's one are all this class, so writeTokens finds them
// the same way on either row.
function tokenCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'manager-tokens';
  cell.textContent = text;
  return cell;
}

// A project's figure with its window named in front of it: `this week 142.9M`. Named on the row
// rather than once above the list, because a heading over the far right of a wide panel is a heading
// nobody connects to a number sixty characters away. A project nothing was spent on has empty figures,
// and the stylesheet hides the name with them.
function labelledTokens(label: string, text: string): HTMLElement {
  const figure = document.createElement('span');
  figure.className = 'manager-figure';
  const name = document.createElement('span');
  name.className = 'manager-figure-name';
  name.textContent = label;
  figure.append(name, tokenCell(text));
  return figure;
}

// The names of the columns under a project, as a row of their own above its first terminal and above
// its first worktree. It shares the grid of the rows under it, so each name sits over its column.
// Not a line the keyboard can land on: it is not in `lines`, and it takes no click.
const GROUP_COLUMNS = {
  pane: ['Terminal', 'Last line on screen', 'Status', 'Last output', 'Tokens'],
  worktree: ['Worktree', 'Changes', 'Started', 'Terminal', ''],
} as const;

function groupHead(kind: keyof typeof GROUP_COLUMNS): HTMLElement {
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

// Whether a line opens a new group under its project, and so wants the column names above it: the
// first terminal, and the first worktree, of each project.
function opensGroup(line: ManagerLine, previous: ManagerLine | undefined): line is Exclude<ManagerLine, { kind: 'project' }> {
  return line.kind !== 'project' && previous?.kind !== line.kind;
}

// Figures written into a row that already has its cells. Strings rather than a project's Totals, so
// a project's three and a pane's one are both written by this — teach a fourth
// window to the rows and the pane row is not the one path that quietly kept its old writer.
// Only a figure that has moved is written: the sweep runs over every row every half minute and almost
// none of them have changed, and setting textContent replaces the text node either way.
function writeTokens(row: Element | undefined, figures: readonly string[]): void {
  const cells = row?.querySelectorAll('.manager-tokens');
  figures.forEach((text, column) => {
    const cell = cells?.[column];
    if (cell && cell.textContent !== text) cell.textContent = text;
  });
}

export function createManagerView(options: ManagerOptions): ManagerView {
  const element = document.createElement('div');
  element.className = 'view view-manager';
  // Focusable, so arriving here takes the keyboard off whatever pane had it. Without it you would be
  // looking at this page while your typing still went into the shell you came from.
  element.tabIndex = -1;
  const empty = document.createElement('p');
  empty.textContent = 'No project is open, so there is nothing to watch yet.';
  const list = document.createElement('ul');
  list.className = 'manager-list';
  // The figures along the top: every open project added up, and the worktrees out.
  const overview = createOverview();
  const projects = document.createElement('section');
  projects.className = 'manager-panel manager-projects';
  const projectsHeading = document.createElement('h2');
  projectsHeading.textContent = 'Projects';
  projects.append(projectsHeading, list);
  const activity = createActivity();
  const body = document.createElement('div');
  body.className = 'manager-body';
  body.append(projects, activity.element);
  // The last line on the page: which build of the app you are looking at. Never hidden, unlike the
  // rest — it is a fact about the app rather than about the projects, so it is still the answer on a
  // window with nothing open. version.ts says where the number comes from.
  const buildVersion = document.createElement('div');
  buildVersion.className = 'manager-version';
  buildVersion.textContent = `v${APP_VERSION}`;
  element.append(overview.element, empty, body, buildVersion);

  // Asked by both draws, and cheap when nothing is due: manager-reads.ts decides what is old. The
  // timer's draw asking too is what keeps the counts moving while the page is only watched.
  function askReads(rows: readonly ManagerRow[]): void {
    options.reads.refresh(
      rows.map((row) => row.path),
      rows.flatMap((row) => row.worktrees.map((entry) => entry.worktreePath)),
    );
  }

  // Everything on the page that is not the list, from one place: both draws want it.
  function drawPanels(rows: readonly ManagerRow[]): void {
    overview.draw(rows, options.reads.dirtiness());
    activity.draw(recentActivity(rows.flatMap((row) => {
      const board = options.reads.boardOf(row.path);
      return board ? [{ project: row.name, board }] : [];
    })));
  }

  function dirtyText(entry: WorktreeEntry): string {
    const { checked, dirty, unreadable } = options.reads.dirtiness();
    return dirtyLabel(entry.worktreePath, checked, dirty, unreadable);
  }

  function writeDirty(cell: Element | null | undefined, entry: WorktreeEntry): void {
    if (!cell) return;
    const { dirty, unreadable } = options.reads.dirtiness();
    cell.textContent = dirtyText(entry);
    cell.classList.toggle('is-dirty', dirty.has(entry.worktreePath));
    cell.classList.toggle('unreadable', unreadable.has(entry.worktreePath));
  }

  let lines: ManagerLine[] = [];
  // The element drawn for each line, by the line's index. Not `list.children`: the column names above
  // each group are children too, and counting them would write one row's figures into its neighbour.
  let rowElements: HTMLElement[] = [];
  // Which projects are showing their panes, kept by slot rather than by position: a project dragged
  // along the tab strip is the same project and stays open.
  const opened = new Set<number>();
  let selected = 0;
  // What the selection is on, rather than where it is. A bell arriving inserts a pane row, and an
  // index alone would slide the highlight onto a different pane between you reading it and pressing
  // Enter — so the next redraw finds the same line again wherever it has moved to.
  let selectedKey = '';
  function paneLine(line: Extract<ManagerLine, { kind: 'pane' }>): HTMLElement {
    const item = document.createElement('li');
    item.className = 'manager-pane';
    const name = document.createElement('span');
    name.className = 'manager-name';
    name.textContent = line.pane.name;

    // Read once, here, and only for a row that is being drawn: it comes off the live terminal, and the
    // panes of a project nobody has opened are not on screen to want it.
    const tailLines = tailBlock(line.pane);
    const lastPrinted = document.createElement('span');
    lastPrinted.className = 'manager-last-printed';
    lastPrinted.textContent = printedLine(line.pane);

    const state = document.createElement('span');
    state.className = `manager-state manager-${line.pane.state}`;
    state.textContent = stateLabel(line.pane.state);
    // How long it has been since the pane printed anything, which is the half of the row worth
    // reading: the text beside it can be a spinner redrawing the same line, but forty minutes is
    // forty minutes. A pane that has printed nothing yet has no age and is given none.
    const age = document.createElement('span');
    age.className = 'manager-age';
    age.textContent = paneAge(line.pane.lastPrintedAt);

    // What the agent in this pane has cost. Nothing at all for a pane with no agent in it, which is
    // most of them: a column of `0` down the list would say only that five shells are not Claude Code.
    const tokens = tokenCell(paneTokens(line.pane.tokens));

    // What the pane has on screen, so the question can be read from here. A pane that has printed
    // nothing gets no empty block under it.
    const tail = document.createElement('pre');
    tail.className = 'manager-tail';
    tail.textContent = tailLines.join('\n');
    tail.hidden = tailLines.length === 0;
    item.append(name, lastPrinted, state, age, tokens, tail);
    return item;
  }

  function projectLine(line: Extract<ManagerLine, { kind: 'project' }>): HTMLElement {
    const item = document.createElement('li');
    item.className = 'manager-project';
    // Only a project with panes to show gets an arrow; on a quiet one there is nothing to open and a
    // marker saying otherwise would be inviting a key that does nothing. A span of its own, so that
    // the name beside it holds a folder's name and nothing else: an arrow sharing that span crosses
    // to the far side of a Persian name and stops lining up with the row above.
    const marker = document.createElement('span');
    marker.className = 'manager-marker';
    marker.textContent = `${canOpen(line.row) ? (line.open ? OPEN : SHUT) : ' '} `;
    const name = document.createElement('span');
    name.className = 'manager-name';
    name.textContent = line.row.name;
    const summary = document.createElement('span');
    summary.className = 'manager-summary';
    summary.textContent = alertSummary(line.row.panes);
    summary.classList.toggle('attention', line.row.panes.some(isAlerting));
    // What is on the project's board, column by column, once its board has been read. board-summary.ts
    // says which cards are counted and why Done is not.
    const board = options.reads.boardOf(line.row.path);
    const chips = countChips(board ? columnCounts(board) : []);
    // The five-hour figure, the week's and all time, each with its name. usage.ts says what the three
    // are and what a project nothing has been spent on prints.
    const figures = document.createElement('span');
    figures.className = 'manager-figures';
    figures.append(...projectTokens(line.row.tokens).map((text, column) => labelledTokens(TOKEN_COLUMNS[column], text)));
    item.append(marker, name, chips, summary, figures);
    return item;
  }

  // A worktree the app made for one of this project's cards. The button is the mouse's way to the same
  // removal the key does, so it selects the row first: the highlight is then on the worktree the
  // question names.
  function worktreeLine(line: Extract<ManagerLine, { kind: 'worktree' }>, index: number): HTMLElement {
    const { entry } = line;
    const item = document.createElement('li');
    item.className = 'manager-worktree';
    // The card's title first, in words, and the branch after it, quieter: the branch is the title cut
    // down to a slug, so leading with it put the same sentence on the row twice, the unreadable copy
    // first.
    const names = document.createElement('span');
    names.className = 'manager-worktree-names';
    const title = document.createElement('span');
    title.className = 'manager-worktree-title';
    title.textContent = entry.reviewing ? `reviewing · ${entry.title}` : entry.title;
    const branch = document.createElement('span');
    branch.className = 'manager-worktree-branch';
    branch.textContent = entry.branch;
    names.append(title, branch);
    const dirty = document.createElement('span');
    dirty.className = 'manager-dirty';
    writeDirty(dirty, entry);
    const age = document.createElement('span');
    age.className = 'manager-age';
    // A timestamp the clock cannot read says nothing rather than "Invalid Date" — see age.ts.
    age.textContent = relativeAge(entry.startedAt) ?? '';
    const pane = document.createElement('span');
    pane.className = 'manager-worktree-pane';
    pane.textContent = worktreePaneText(entry);
    const remove = document.createElement('button');
    remove.className = 'manager-remove';
    remove.type = 'button';
    remove.textContent = 'Remove';
    // Out of the Tab order: the list is walked with the arrows, and a button Tab can land on is a
    // second place the keyboard can be that the highlight does not show.
    remove.tabIndex = -1;
    remove.addEventListener('click', (event) => {
      // Kept off the row, whose own click would go to the worktree's pane.
      event.stopPropagation();
      setSelection(index);
      options.onChanged();
      options.onRemoveWorktree(entry);
    });
    item.append(names, dirty, age, pane, remove);
    return item;
  }

  // Only a project with something to show can be opened or shut: on a quiet row the key does nothing
  // rather than opening an empty gap. A row left open stays in the set while the project is quiet, so
  // it draws itself open again when one of its panes rings.
  function toggle(row: ManagerRow): void {
    if (!canOpen(row)) return;
    if (opened.has(row.slot)) opened.delete(row.slot);
    else opened.add(row.slot);
  }

  // Where the selection is and what it is on, always written together: set one without the other and
  // the next redraw hunts for a line the highlight is no longer on and drags it back.
  function setSelection(index: number): void {
    selected = index;
    selectedKey = lines[index] ? lineKey(lines[index]) : '';
  }

  // The rows flattened to the lines on screen, with the highlight put back onto the line it was on
  // wherever a project opening its panes has pushed it to. Both redraws start here, so neither can
  // leave the selection naming one row while it sits on another.
  function relayout(rows: readonly ManagerRow[]): void {
    lines = managerLines(rows, opened);
    setSelection(heldIndex(lines.map(lineKey), selectedKey, selected));
  }

  // The list does not wrap: holding Down stops on the last line rather than carrying you back to the
  // first project, which would be a jump you did not ask for. Nothing is redrawn for the arrow that
  // stops there — every row reads its pane's live screen as it is built, and rebuilding thirty of them
  // to move the highlight nowhere is what a held key would do thirty times a second.
  function move(direction: 'up' | 'down'): void {
    const next = clampIndex(selected + (direction === 'down' ? 1 : -1), lines.length - 1);
    if (next === selected) return;
    setSelection(next);
    options.onChanged();
  }

  // Enter and a click both land here, and the redraw is here rather than inside toggle so that a row
  // which opens nothing still redraws.
  function open(): void {
    const line = lines[selected];
    if (!line) return;
    if (line.kind === 'pane') return options.onJump(line.slot, line.pane.index);
    // A worktree with no pane, or in a project closed since, says so rather than looking like a key
    // that did nothing. A landing that worked takes back whatever the last one said.
    // Redrawn either way, so a click on a worktree that cannot be landed on still moves the highlight
    // to it; a landing that worked has left this page already.
    if (line.kind === 'worktree') options.onError(options.onJumpWorktree(line.entry));
    else toggle(line.row);
    options.onChanged();
  }

  // Everything the window did not claim: a typed character on a waiting row goes straight to that
  // pane's shell, so a menu is answered without leaving this page. The arrows and Enter never reach
  // here — the window's one lookup matches them first and stops them — and shortcuts.ts says which
  // keystrokes count as typed and why the rest are kept out.
  element.addEventListener('keydown', (event) => {
    if (!isBareCharacter(event)) return;
    const line = lines[selected];
    if (!line || line.kind !== 'pane' || !takesAnswer(line.pane)) return;
    event.preventDefault();
    // The highlight stays on the pane that was answered: the bell comes off it, but the row does not
    // go anywhere, so a second question from the same pane is answered without picking it again.
    options.onAnswer(line.slot, line.pane.index, event.key);
  });

  return {
    element,
    render(rows: readonly ManagerRow[]): void {
      askReads(rows);
      relayout(rows);
      const anyOpen = rows.length > 0;
      empty.hidden = anyOpen;
      // Nothing is open, so there is nothing to list, add up or report. All of it goes, leaving the
      // sentence saying how to open a project on a page of its own.
      overview.element.hidden = !anyOpen;
      body.hidden = !anyOpen;
      drawPanels(rows);
      const children: HTMLElement[] = [];
      rowElements = lines.map((line, index) => {
        const item = line.kind === 'pane' ? paneLine(line)
          : line.kind === 'worktree' ? worktreeLine(line, index) : projectLine(line);
        // A click moves the selection to the row first and then does what Enter does there.
        item.addEventListener('click', () => {
          setSelection(index);
          open();
        });
        if (index === selected) item.classList.add('highlighted');
        if (opensGroup(line, lines[index - 1])) children.push(groupHead(line.kind));
        children.push(item);
        return item;
      });
      list.replaceChildren(...children);
      rowElements[selected]?.scrollIntoView({ block: 'nearest' });
    },
    // Every thirty seconds, so neither the ages nor the lines beside them freeze where they stand. A
    // pane printing calls nothing — the bytes go into the terminal and that is all — so without this
    // a quiet row's line only moves when a keystroke, a bell or an exit forces a whole redraw, and
    // the age sits beside it saying `just now` about text from ten minutes ago.
    // The spans are rewritten in place rather than the list rebuilt: rebuilding would scroll back
    // to the highlight and throw away the line you had selected to copy out, under someone who is
    // sitting there reading it. The state span is not touched — every state change ends in a full
    // redraw of its own.
    refreshRows(rows: readonly ManagerRow[]): void {
      // Written into the rows that are on screen, so this writes only while the fresh rows are those
      // rows. A project opened or a pane appeared means a full render is what caused it and a full
      // render is what draws it; writing into `rowElements` on a shape that moved would put one
      // pane's line on its neighbour. The lines themselves are taken, stale panes and all, because
      // the timestamps they hold are copies made when the row was last drawn.
      // Ahead of the check below, because the overview and the activity are not rows: they add up
      // every open project whatever the list underneath is doing, so a sweep that lands while a
      // row is opening still moves them.
      askReads(rows);
      drawPanels(rows);
      const fresh = managerLines(rows, opened);
      const sameRows = fresh.length === lines.length
        && fresh.every((line, index) => lineKey(line) === lineKey(lines[index]));
      if (!sameRows) return;
      // Kept, so the status bar reads the selected pane's age off the same numbers the row shows.
      lines = fresh;
      lines.forEach((line, index) => {
        const row = rowElements[index];
        // Rewritten with the rest: an agent spends while its state stays `quiet`, so a figure left out
        // of this redraw sits at what it was when the row was built. The project's three go the same
        // way as a pane's one — writing them here is what lets a sweep move a figure without the list
        // being torn down and rebuilt under someone reading it.
        if (line.kind === 'project') {
          writeTokens(row, projectTokens(line.row.tokens));
          return;
        }
        if (line.kind === 'worktree') {
          writeDirty(row?.querySelector('.manager-dirty'), line.entry);
          const age = row?.querySelector('.manager-age');
          if (age) age.textContent = relativeAge(line.entry.startedAt) ?? '';
          return;
        }
        const lastPrinted = row?.querySelector('.manager-last-printed');
        if (lastPrinted) lastPrinted.textContent = printedLine(line.pane);
        const age = row?.querySelector('.manager-age');
        if (age) age.textContent = paneAge(line.pane.lastPrintedAt);
        writeTokens(row, [paneTokens(line.pane.tokens)]);
        const tail = row?.querySelector<HTMLElement>('.manager-tail');
        if (tail) {
          const block = tailBlock(line.pane);
          tail.textContent = block.join('\n');
          tail.hidden = block.length === 0;
        }
      });
    },
    statusLabel(): string {
      const line = lines[selected];
      if (!line) return '';
      if (line.kind === 'worktree') {
        return `${line.entry.branch} · ${dirtyText(line.entry)} · `
          + `${options.binding('manager-remove')} removes it`;
      }
      if (line.kind === 'pane') {
        const answer = takesAnswer(line.pane) ? ' · type a character to answer it' : '';
        const age = paneAge(line.pane.lastPrintedAt);
        return `${line.pane.name} · ${line.pane.state}${age === '' ? '' : ` · ${age}`}${answer}`;
      }
      return `${line.row.name} · ${alertSummary(line.row.panes)}`;
    },
    runAction(action: Action): void {
      if (action.kind === 'manager-select') return move(action.direction);
      if (action.kind === 'manager-open') return open();
      // manager.ts says which lines the removal key acts on.
      if (action.kind === 'manager-remove') {
        const entry = lines[selected] ? removableWorktree(lines[selected]) : null;
        if (entry) options.onRemoveWorktree(entry);
        return;
      }
      // A pane row closes its project, rather than doing nothing: the close key is aimed at a project
      // and the panes on screen are that project's, so the key means the same thing wherever the
      // highlight is inside the block. Which project a line belongs to is manager.ts's to answer.
      if (action.kind === 'project-close') {
        const line = lines[selected];
        if (line) options.onClose(slotOfLine(line));
      }
    },
  };
}
