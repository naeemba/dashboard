import type { Action } from './actions';
import type { DashboardBridge } from './bridge';
import { clampIndex } from './clamp-index';
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
  const unfolded = new Set<LogEntry>();
  let selected = 0;
  let shown: LogEntry[] = [];

  function render(): void {
    shown = entries.filter((entry) => matchesLogFilter(entry, input.value)).reverse();
    selected = clampIndex(selected, shown.length - 1);
    list.replaceChildren(...shown.map((entry, index) => {
      const row = document.createElement('li');
      row.className = `log-row level-${entry.level}`;
      row.classList.toggle('highlighted', index === selected);
      row.classList.toggle('unfolded', unfolded.has(entry));
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
    empty.textContent = entries.length === 0 ? 'Nothing logged yet.' : 'Nothing matches the filter.';
    list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  function toggle(): void {
    const entry = shown[selected];
    if (entry === undefined) return;
    if (unfolded.has(entry)) unfolded.delete(entry);
    else unfolded.add(entry);
    render();
  }

  input.addEventListener('input', () => {
    selected = 0;
    render();
  });

  // Live while the app runs, whether or not the section is on screen, so arriving shows nothing stale.
  // The thousand-row cap is the read's: anything older is in the file.
  options.bridge.onLogAppended((entry) => {
    entries.push(entry);
    if (entries.length > LOG_READ_COUNT) entries = entries.slice(-LOG_READ_COUNT);
    render();
  });

  return {
    element,
    async open() {
      input.focus();
      try {
        const read = await options.bridge.readLog();
        entries = read.entries;
        file.textContent = read.file;
        options.onError('');
      } catch (error: unknown) {
        options.onError(`Log not read: ${failureText(error)}`);
      }
      render();
    },
    focus: () => input.focus(),
    runAction(action) {
      if (action.kind === 'log-select') {
        selected = clampIndex(selected + (action.direction === 'up' ? -1 : 1), shown.length - 1);
        render();
      }
      if (action.kind === 'log-open') toggle();
      if (action.kind === 'log-filter-reset') {
        input.value = '';
        selected = 0;
        render();
      }
    },
  };
}
