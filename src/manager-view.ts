import type { Action } from './actions';
import { clampIndex, heldIndex } from './clamp-index';
import {
  alertSummary, canOpen, isAlerting, lineKey, managerLines, paneAge, slotOfLine, takesAnswer,
  type ManagerLine, type ManagerRow, type PaneSummary,
} from './manager';
import { isBareCharacter } from './shortcuts';
import { paneTokens, projectTokens } from './usage';

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
};

export type ManagerView = {
  element: HTMLElement;
  // The rows are read from the renderer's pages, which are the live ones — the page holds none of its
  // own, so a bell that arrives while you are looking at it shows up on the next redraw.
  render(rows: readonly ManagerRow[]): void;
  // The timer's redraw: the three things on a pane row that change while nothing else does — the line
  // it last printed, how long ago that was, and the block of screen under a row that is asking you
  // something.
  refreshPanes(rows: readonly ManagerRow[]): void;
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

export function createManagerView(options: ManagerOptions): ManagerView {
  const element = document.createElement('div');
  element.className = 'view view-manager';
  // Focusable, so arriving here takes the keyboard off whatever pane had it. Without it you would be
  // looking at this page while your typing still went into the shell you came from.
  element.tabIndex = -1;
  const heading = document.createElement('h1');
  heading.textContent = 'Manager';
  const empty = document.createElement('p');
  empty.textContent = 'No project is open, so there is nothing to watch yet.';
  const list = document.createElement('ul');
  list.className = 'manager-list';
  element.append(heading, empty, list);

  let lines: ManagerLine[] = [];
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
    state.textContent = line.pane.state;
    // How long it has been since the pane printed anything, which is the half of the row worth
    // reading: the text beside it can be a spinner redrawing the same line, but forty minutes is
    // forty minutes. A pane that has printed nothing yet has no age and is given none.
    const age = document.createElement('span');
    age.className = 'manager-age';
    age.textContent = paneAge(line.pane.lastPrintedAt);

    // What the agent in this pane has cost. Nothing at all for a pane with no agent in it, which is
    // most of them: a column of `0` down the list would say only that five shells are not Claude Code.
    const tokens = document.createElement('span');
    tokens.className = 'manager-tokens';
    tokens.textContent = paneTokens(line.pane.tokens);

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
    // The five-hour figure, the week's and all time, in that order — soonest to widest, so the number
    // that moves while you watch is the one nearest the rest of the row. Empty for a project nothing
    // has ever been spent on, rather than three noughts.
    const tokens = document.createElement('span');
    tokens.className = 'manager-tokens';
    tokens.textContent = projectTokens(line.row.tokens);
    item.append(marker, name, summary, tokens);
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
    toggle(line.row);
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
      relayout(rows);
      empty.hidden = rows.length > 0;
      list.replaceChildren(...lines.map((line, index) => {
        const item = line.kind === 'pane' ? paneLine(line) : projectLine(line);
        // A click moves the selection to the row first and then does what Enter does there.
        item.addEventListener('click', () => {
          setSelection(index);
          open();
        });
        if (index === selected) item.classList.add('highlighted');
        return item;
      }));
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
    },
    // Every thirty seconds, so neither the ages nor the lines beside them freeze where they stand. A
    // pane printing calls nothing — the bytes go into the terminal and that is all — so without this
    // a quiet row's line only moves when a keystroke, a bell or an exit forces a whole redraw, and
    // the age sits beside it saying `just now` about text from ten minutes ago.
    // The three spans are rewritten in place rather than the list rebuilt: rebuilding would scroll back
    // to the highlight and throw away the line you had selected to copy out, under someone who is
    // sitting there reading it. The state span is not touched — every state change ends in a full
    // redraw of its own.
    refreshPanes(rows: readonly ManagerRow[]): void {
      // Written into the rows that are on screen, so this writes only while the fresh rows are those
      // rows. A project opened or a pane appeared means a full render is what caused it and a full
      // render is what draws it; writing into `list.children` on a shape that moved would put one
      // pane's line on its neighbour. The lines themselves are taken, stale panes and all, because
      // the timestamps they hold are copies made when the row was last drawn.
      const fresh = managerLines(rows, opened);
      const sameRows = fresh.length === lines.length
        && fresh.every((line, index) => lineKey(line) === lineKey(lines[index]));
      if (!sameRows) return;
      // Kept, so the status bar reads the selected pane's age off the same numbers the row shows.
      lines = fresh;
      lines.forEach((line, index) => {
        const row = list.children[index];
        // Rewritten with the rest: an agent spends while its state stays `quiet`, so a figure left out
        // of this redraw sits at what it was when the row was built. The project's three go the same
        // way as a pane's one — writing them here is what lets a sweep move a figure without the list
        // being torn down and rebuilt under someone reading it.
        const tokens = row?.querySelector('.manager-tokens');
        if (line.kind === 'project') {
          if (tokens) tokens.textContent = projectTokens(line.row.tokens);
          return;
        }
        const lastPrinted = row?.querySelector('.manager-last-printed');
        if (lastPrinted) lastPrinted.textContent = printedLine(line.pane);
        const age = row?.querySelector('.manager-age');
        if (age) age.textContent = paneAge(line.pane.lastPrintedAt);
        if (tokens) tokens.textContent = paneTokens(line.pane.tokens);
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
