import type { Action } from '../../shared/keys/actions';
import type { DashboardBridge } from '../../shared/app/bridge';
import { clampIndex, heldIndex } from '../../shared/app/clamp-index';
import { failureText } from '../../shared/errors/failure';
import { LOG_READ_COUNT, matchesLogFilter, type LogEntry } from '../../shared/app/log-entry';
import { iconOnlyButton } from '../app/icons';
import { dataOverlay } from '../drawer/data-viewer';
import { copiedEntry, shownEntry } from './log-popup';

export type LogOptions = {
  bridge: DashboardBridge;
  // The status bar's error span, under this section's own owner.
  onError(message: string): void;
  // The same span for what is not a failure: that the entry is on the clipboard.
  onNotice(message: string): void;
  // What a key is bound to now, so the popup hears the copy key in force.
  binding(actionName: string): string;
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
  // Cloned into every row; the list's one listener answers it.
  const copyButton = iconOnlyButton('log-copy', 'copy', 'Copy as JSON', () => {});
  // Out of the Tab order, as the manager's Remove button is: the list is walked with the arrows.
  copyButton.tabIndex = -1;

  // Oldest first, as the file holds them; drawn reversed.
  let entries: LogEntry[] = [];
  // Keyed on the fields, not the object: arriving re-reads the file into fresh objects, and the selection
  // has to survive that. In a fixed order, because an entry that arrived live and the same entry read
  // back from the file hold their properties in different orders.
  const keyOf = (entry: LogEntry): string =>
    JSON.stringify([entry.time, entry.level, entry.kind, entry.project ?? '', entry.message]);
  let selected = 0;
  let shown: LogEntry[] = [];
  let readFailed = false;

  // Which entries pass the filter, newest first. A new line goes in at the top and moves every row
  // under it down one, so the selection follows the entry it was on rather than staying at its
  // position — otherwise Enter would open whatever slid into the row you picked. A changed filter
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
      const project = entry.project === undefined ? '' : `  ${entry.project}`;
      const text = document.createElement('span');
      text.className = 'log-text';
      text.textContent = `${new Date(entry.time).toLocaleString()}  ${entry.level}  ${entry.kind}${project}  ${entry.message}`;
      // Clicks are heard once, on the list, rather than by a listener on each of a thousand rows.
      row.append(text, copyButton.cloneNode(true));
      return row;
    }));
    empty.hidden = shown.length > 0;
    if (entries.length > 0) empty.textContent = 'Nothing matches the filter.';
    else empty.textContent = readFailed ? 'The log could not be read.' : 'Nothing logged yet.';
    if (scroll) list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  function copySelected(): void {
    const entry = shown[selected];
    if (entry !== undefined) copyEntry(entry);
  }

  function copyEntry(entry: LogEntry): void {
    navigator.clipboard.writeText(copiedEntry(entry)).then(
      () => options.onNotice('Entry copied as JSON.'),
      (error: unknown) => options.onError(`Entry not copied: ${failureText(error)}`),
    );
  }

  // The drawer's JSON viewer, the entry pretty-printed and its stack one frame to a line. Escape puts
  // it away and the keyboard returns to the box; the copy key copies the entry from there too — the one
  // opened, not whatever a line arriving has moved the selection onto since.
  function openSelected(): void {
    const entry = shown[selected];
    if (entry === undefined) return;
    dataOverlay('', JSON.stringify(shownEntry(entry)), 'json', null, {
      binding: options.binding('log-copy'), label: 'copies', run: () => copyEntry(entry),
    });
  }

  // A click on a row is the selection moving there, then what Enter does there, or on its button what
  // the copy key does. The keyboard goes back to the box, which a click on the section itself would
  // otherwise have taken it from; the popup takes it from there.
  list.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest('.log-row');
    const index = row === null ? -1 : [...list.children].indexOf(row);
    if (index < 0) return;
    selected = index;
    draw(false);
    input.focus();
    if (event.target.closest('.log-copy')) copySelected();
    else openSelected();
  });

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
      if (action.kind === 'log-open') openSelected();
      if (action.kind === 'log-copy') copySelected();
      if (action.kind === 'log-filter-reset') {
        input.value = '';
        refilter(false);
        draw(true);
      }
    },
  };
}
