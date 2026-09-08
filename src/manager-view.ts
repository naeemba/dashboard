import type { Action } from './actions';
import {
  alertSummary, canOpen, clampLine, lineKey, managerLines, selectedLine,
  type ManagerLine, type ManagerRow,
} from './manager';

export type ManagerOptions = {
  // Where a pane row lands you: the project holding that slot, and the pane at that index.
  onJump(slot: number, index: number): void;
  // Redraws the page. The rows are the renderer's, so the view asks for them back rather than keeping
  // its own copy; the status bar, which names what the selection is on, is redrawn by the same call.
  onChanged(): void;
};

export type ManagerView = {
  element: HTMLElement;
  // The rows are read from the renderer's pages, which are the live ones — the page holds none of its
  // own, so a bell that arrives while you are looking at it shows up on the next redraw.
  render(rows: readonly ManagerRow[]): void;
  statusLabel(): string;
  // The manager's own keys, found by the window's one lookup and handed here. Same arrangement the
  // board has, and for the same reason: one place decides what every key on every screen does.
  runAction(action: Action): void;
};

// What the row says instead of a pane list when the project has nothing to show.
const SHUT = '▸';
const OPEN = '▾';

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
    name.textContent = line.alert.name;
    const state = document.createElement('span');
    state.className = `manager-state manager-${line.alert.state}`;
    state.textContent = line.alert.state;
    item.append(name, state);
    return item;
  }

  function projectLine(line: Extract<ManagerLine, { kind: 'project' }>): HTMLElement {
    const item = document.createElement('li');
    item.className = 'manager-project';
    const name = document.createElement('span');
    name.className = 'manager-name';
    // Only a project with panes to show gets an arrow; on a quiet one there is nothing to open and a
    // marker saying otherwise would be inviting a key that does nothing.
    const marker = canOpen(line.row) ? (line.open ? OPEN : SHUT) : ' ';
    name.textContent = `${marker} ${line.row.name}`;
    const summary = document.createElement('span');
    summary.className = 'manager-summary';
    summary.textContent = alertSummary(line.row.alerts);
    item.append(name, summary);
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

  function move(direction: 'up' | 'down'): void {
    setSelection(clampLine(lines.length, selected + (direction === 'down' ? 1 : -1)));
    options.onChanged();
  }

  // Enter and a click both land here, and the redraw is here rather than inside toggle so that a row
  // which opens nothing still redraws.
  function open(): void {
    const line = lines[selected];
    if (!line) return;
    if (line.kind === 'pane') return options.onJump(line.slot, line.alert.index);
    toggle(line.row);
    options.onChanged();
  }

  return {
    element,
    render(rows: readonly ManagerRow[]): void {
      lines = managerLines(rows, opened);
      setSelection(selectedLine(lines, selectedKey, selected));
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
    statusLabel(): string {
      const line = lines[selected];
      if (!line) return '';
      if (line.kind === 'pane') return `${line.alert.name} · ${line.alert.state}`;
      return `${line.row.name} · ${alertSummary(line.row.alerts)}`;
    },
    runAction(action: Action): void {
      if (action.kind === 'manager-select') return move(action.direction);
      if (action.kind === 'manager-open') return open();
    },
  };
}
