import type { Action } from './actions';
import type { DashboardBridge } from './bridge';
import { clampIndex, heldIndex } from './clamp-index';
import { failureText } from './failure';
import { LOG_READ_COUNT, matchesLogFilter, type LogEntry } from './log-entry';

export type LogOptions = {
  bridge: DashboardBridge;
  // The status bar's error span, under this section's own owner.
  onError(message: string): void;
};

export type LogView = {
  element: HTMLElement;
  // Arriving: the newest entries are read again and the filter box takes the keyboard. Never rejects.
  open(): Promise<void>;
  focus(): void;
  runAction(action: Action): void;
};

// The manager's log section: the newest thousand entries, newest at the top, with a box above them that
// narrows them the way the command box sits above the command screen. The box has the keyboard, so the
// screen's keys are arrows, Enter and Escape and nothing a filter would want to type.
export function createLogView(options: LogOptions): LogView {
  const element = document.createElement('div');
  element.className = 'view view-log';
  element.tabIndex = -1;
  const input = document.createElement('input');
  input.className = 'command-input log-filter';
  input.type = 'text';
  input.placeholder = 'Filter: error, card, a project name';
  // Every box you type into carries this; see the command box.
  input.dir = 'auto';
  const file = document.createElement('p');
  file.className = 'log-file';
  const list = document.createElement('ul');
  list.className = 'command-list log-list';
  const empty = document.createElement('p');
  element.append(input, file, list, empty);

  // Oldest first, as the file holds them; drawn reversed.
  let entries: LogEntry[] = [];
  // Keyed on the line, not the object: arriving re-reads the file into fresh objects, and the selection
  // and the unfolded rows have to survive that.
  const keyOf = (entry: LogEntry): string => JSON.stringify(entry);
  const unfolded = new Set<string>();
  let selected = 0;
  let shown: LogEntry[] = [];
  let readFailed = false;

  // Which entries pass the filter, newest first. A new line goes in at the top and moves every row
  // under it down one, so the selection follows the entry it was on rather than staying at its
  // position — otherwise Enter would unfold whatever slid into the row you picked. A changed filter
  // is a new list and starts at the top instead.
  function refilter(follow: boolean): void {
    const previous = shown[selected];
    shown = entries.filter((entry) => matchesLogFilter(entry, input.value)).reverse();
    selected = follow ? heldIndex(shown.map(keyOf), previous && keyOf(previous), selected) : 0;
  }

  // `scroll` only when a key or a click moved the selection: a line arriving must not drag a list
  // you scrolled back with the wheel down to wherever the selection is.
  function draw(scroll: boolean): void {
    list.replaceChildren(...shown.map((entry, index) => {
      const row = document.createElement('li');
      row.className = `log-row level-${entry.level}`;
      row.classList.toggle('highlighted', index === selected);
      row.classList.toggle('unfolded', unfolded.has(keyOf(entry)));
      const project = entry.project === undefined ? '' : `  ${entry.project}`;
      row.textContent = `${new Date(entry.time).toLocaleString()}  ${entry.level}  ${entry.kind}${project}  ${entry.message}`;
      // A click is the selection moving there, then what Enter does there. The keyboard goes back to the
      // box, which a click on the section itself would otherwise have taken it from.
      row.addEventListener('click', () => {
        selected = index;
        toggle();
        input.focus();
      });
      return row;
    }));
    empty.hidden = shown.length > 0;
    if (entries.length > 0) empty.textContent = 'Nothing matches the filter.';
    else empty.textContent = readFailed ? 'The log could not be read.' : 'Nothing logged yet.';
    if (scroll) list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  function toggle(): void {
    const entry = shown[selected];
    if (entry === undefined) return;
    const key = keyOf(entry);
    if (unfolded.has(key)) unfolded.delete(key);
    else unfolded.add(key);
    draw(true);
  }

  input.addEventListener('input', () => {
    refilter(false);
    draw(true);
  });

  // Kept while the section is hidden too, but drawn only while it is showing: arriving re-reads the
  // file anyway, so drawing a thousand rows nobody can see on every line would be work thrown away.
  // Hidden means this section or anything around it — on a project's page the whole manager page is
  // hidden, and the section's own attribute still says it is the one showing.
  // The thousand-row cap is the read's: anything older is in the file.
  options.bridge.onLogAppended((entry) => {
    entries.push(entry);
    if (entries.length > LOG_READ_COUNT) entries.shift();
    if (element.closest('[hidden]')) return;
    refilter(true);
    draw(false);
  });

  return {
    element,
    async open() {
      input.focus();
      try {
        const read = await options.bridge.readLog();
        entries = read.entries;
        file.textContent = read.file;
        readFailed = false;
        options.onError('');
      } catch (error: unknown) {
        readFailed = true;
        options.onError(`Log not read: ${failureText(error)}`);
      }
      refilter(true);
      draw(true);
    },
    focus: () => input.focus(),
    runAction(action) {
      if (action.kind === 'log-select') {
        selected = clampIndex(selected + (action.direction === 'up' ? -1 : 1), shown.length - 1);
        draw(true);
      }
      if (action.kind === 'log-open') toggle();
      if (action.kind === 'log-filter-reset') {
        input.value = '';
        refilter(false);
        draw(true);
      }
    },
  };
}
