import type { Action } from './actions';
import { clampIndex } from './clamp-index';
import {
  alertSummary, canOpen, lineKey, managerLines, selectedLine, takesAnswer,
  type ManagerLine, type ManagerRow,
} from './manager';
import { isBareCharacter } from './shortcuts';

export type ManagerOptions = {
  // Where a pane row lands you: the project holding that slot, and the pane at that index.
  onJump(slot: number, index: number): void;
  // One keystroke, straight to that pane's shell, without going there.
  onAnswer(slot: number, index: number, key: string): void;
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

    // What the pane has on screen, so the question can be read from here. A pane that has printed
    // nothing gets no empty block under it.
    const tail = document.createElement('pre');
    tail.className = 'manager-tail';
    tail.textContent = line.alert.tail.join('\n');
    tail.hidden = line.alert.tail.length === 0;
    item.append(name, state, tail);
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
    summary.textContent = alertSummary(line.row.alerts);
    item.append(marker, name, summary);
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

  // The list does not wrap: holding Down stops on the last pane rather than carrying you back to the
  // first project, which would be a jump you did not ask for.
  function move(direction: 'up' | 'down'): void {
    setSelection(clampIndex(selected + (direction === 'down' ? 1 : -1), lines.length - 1));
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

  // Everything the window did not claim: a typed character on a waiting row goes straight to that
  // pane's shell, so a menu is answered without leaving this page. The arrows and Enter never reach
  // here — the window's one lookup matches them first and stops them — and shortcuts.ts says which
  // keystrokes count as typed and why the rest are kept out.
  element.addEventListener('keydown', (event) => {
    if (!isBareCharacter(event)) return;
    const line = lines[selected];
    if (!line || line.kind !== 'pane' || !takesAnswer(line.alert)) return;
    event.preventDefault();
    options.onAnswer(line.slot, line.alert.index, event.key);
  });

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
      if (line.kind === 'pane') {
        const answer = takesAnswer(line.alert) ? ' · any key answers it' : '';
        return `${line.alert.name} · ${line.alert.state}${answer}`;
      }
      return `${line.row.name} · ${alertSummary(line.row.alerts)}`;
    },
    runAction(action: Action): void {
      if (action.kind === 'manager-select') return move(action.direction);
      if (action.kind === 'manager-open') return open();
    },
  };
}
