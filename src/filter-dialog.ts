import { PRIORITIES, type Priority } from './board';
import { AGES, emptyFilter, FAMILIES, PRESENCES, type BoardFilter } from './board-filter';
import { openOverlay } from './overlay';
import { isModified } from './shortcuts';

type ChoiceField = 'family' | 'branch' | 'pullRequest' | 'comments' | 'created' | 'updated';

// One line of the dialog. The arrows walk these; what a key does on one depends on its kind.
export type FilterRow =
  | { kind: 'text'; label: 'Text' }
  | { kind: 'priority'; label: Priority }
  | { kind: 'choice'; label: string; field: ChoiceField; values: readonly string[] }
  | { kind: 'reset'; label: 'Reset' };

export function filterRows(): FilterRow[] {
  return [
    { kind: 'text', label: 'Text' },
    ...PRIORITIES.map((priority): FilterRow => ({ kind: 'priority', label: priority })),
    { kind: 'choice', label: 'Subtasks', field: 'family', values: FAMILIES },
    { kind: 'choice', label: 'Branch', field: 'branch', values: PRESENCES },
    { kind: 'choice', label: 'Pull request', field: 'pullRequest', values: PRESENCES },
    { kind: 'choice', label: 'Comments', field: 'comments', values: PRESENCES },
    { kind: 'choice', label: 'Created', field: 'created', values: AGES },
    { kind: 'choice', label: 'Updated', field: 'updated', values: AGES },
    { kind: 'reset', label: 'Reset' },
  ];
}

// The keys each kind of row edits on. The text row is the box's: its keys are typing.
const ROW_KEYS: Record<FilterRow['kind'], readonly string[]> = {
  text: [],
  priority: [' ', 'Enter', 'ArrowLeft', 'ArrowRight'],
  choice: ['ArrowLeft', 'ArrowRight'],
  reset: [' ', 'Enter'],
};

// What a key does to the filter on this row. The same filter back when the row does not take it.
export function applyRowKey(filter: BoardFilter, row: FilterRow, key: string): BoardFilter {
  if (!ROW_KEYS[row.kind].includes(key)) return filter;
  switch (row.kind) {
    case 'text': return filter;
    case 'reset': return emptyFilter();
    case 'priority': {
      const on = filter.priorities.includes(row.label);
      return {
        ...filter,
        priorities: on ? filter.priorities.filter((priority) => priority !== row.label) : [...filter.priorities, row.label],
      };
    }
    case 'choice': {
      const at = row.values.indexOf(filter[row.field]);
      const step = key === 'ArrowRight' ? 1 : -1;
      return { ...filter, [row.field]: row.values[(at + step + row.values.length) % row.values.length] };
    }
  }
}

export type DialogKey = 'next' | 'previous' | 'close' | 'edit' | 'swallow' | 'ignore';

// What the dialog does with a keystroke on the highlighted row. Tab is swallowed before the modifier
// guard, because nothing else here is focusable and Tab would drop focus into the pane behind. Every
// other modified key is left to the browser, so Cmd+A and Cmd+V still work in the text box.
export function dialogKey(row: FilterRow, key: string, input: { modified: boolean }): DialogKey {
  if (key === 'Tab') return 'swallow';
  if (input.modified) return 'ignore';
  if (key === 'ArrowDown') return 'next';
  if (key === 'ArrowUp') return 'previous';
  if (key === 'Escape') return 'close';
  if (ROW_KEYS[row.kind].includes(key)) return 'edit';
  return key === 'Enter' ? 'close' : 'ignore';
}

function rowValue(filter: BoardFilter, row: FilterRow): string {
  switch (row.kind) {
    case 'text': return '';
    case 'reset': return 'clear every field';
    case 'priority': return filter.priorities.includes(row.label) ? 'on' : 'off';
    case 'choice': return filter[row.field];
  }
}

// The board's filter, edited in place. Each edit is handed to `onChange` as it happens, so the board
// behind redraws while you choose; the promise settles with the last one when the dialog closes, on
// Enter, Escape, or a click on the margin. Closing never undoes an edit: Reset is how you go back.
export function openFilterDialog(start: BoardFilter, onChange: (filter: BoardFilter) => void): Promise<BoardFilter> {
  const rows = filterRows();
  let filter = start;
  let highlighted = 0;

  return new Promise<BoardFilter>((resolve) => {
    const { dialog, remove } = openOverlay('filter', () => finish());
    function finish(): void {
      remove();
      resolve(filter);
    }

    const text = document.createElement('input');
    text.className = 'filter-text';
    // Words typed in Persian turn the box round as you type them.
    text.dir = 'auto';
    text.placeholder = 'Title, notes, comments or branch';
    text.value = filter.text;
    const list = document.createElement('ul');
    list.className = 'filter-list';
    const keys = document.createElement('p');
    keys.className = 'filter-keys';
    keys.textContent = '↑↓ choose · ←→ change · Space toggles · Enter or Escape closes';
    dialog.append(list, keys);

    function edit(next: BoardFilter): void {
      if (next === filter) return;
      filter = next;
      if (text.value !== filter.text) text.value = filter.text;
      onChange(filter);
      draw();
    }

    function renderRow(row: FilterRow, index: number): HTMLElement {
      const item = document.createElement('li');
      item.className = `filter-row${index === highlighted ? ' highlighted' : ''}`;
      const label = document.createElement('span');
      label.className = 'filter-label';
      label.textContent = row.label;
      item.append(label);
      if (row.kind === 'text') {
        item.append(text);
      } else {
        const value = document.createElement('span');
        value.className = 'filter-value';
        value.textContent = rowValue(filter, row);
        item.append(value);
      }
      // A click moves the highlight to the row, then does what Enter does there — Right on a choice,
      // which has no Enter of its own.
      item.addEventListener('click', () => {
        highlighted = index;
        if (row.kind === 'text') return draw();
        const next = applyRowKey(filter, row, row.kind === 'choice' ? 'ArrowRight' : 'Enter');
        if (next === filter) draw();
        else edit(next);
      });
      return item;
    }

    function draw(): void {
      list.replaceChildren(...rows.map(renderRow));
      // The box has the keyboard while its row is highlighted; otherwise the dialog does, or a
      // keystroke meant for a priority would be typed into the box.
      if (rows[highlighted].kind === 'text') text.focus();
      else dialog.focus();
    }

    text.addEventListener('input', () => edit({ ...filter, text: text.value }));

    dialog.addEventListener('keydown', (event) => {
      const row = rows[highlighted];
      const action = dialogKey(row, event.key, { modified: isModified(event) });
      if (action === 'ignore') return;
      event.preventDefault();
      switch (action) {
        case 'swallow': return;
        case 'close': return finish();
        case 'next':
        case 'previous':
          highlighted = (highlighted + (action === 'next' ? 1 : -1) + rows.length) % rows.length;
          return draw();
        case 'edit': return edit(applyRowKey(filter, row, event.key));
      }
    });

    draw();
  });
}
