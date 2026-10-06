import { describe, expect, it } from 'vitest';
import { emptyFilter, type BoardFilter } from './board-filter';
import { applyRowKey, dialogKey, filterRows } from './filter-dialog';

const rows = filterRows();
const row = (name: string) => rows.find((entry) => entry.label === name)!;

describe('filter rows', () => {
  it('lists text, four priorities, the choices and reset, in that order', () => {
    expect(rows.map((entry) => entry.label)).toEqual([
      'Text', 'urgent', 'high', 'medium', 'low', 'Subtasks', 'Branch', 'Pull request', 'Comments',
      'Created', 'Updated', 'Reset',
    ]);
  });

  it('toggles a priority on Space, Enter, Left and Right', () => {
    const on = applyRowKey(emptyFilter(), row('high'), ' ');
    expect(on.priorities).toEqual(['high']);
    expect(applyRowKey(on, row('high'), 'ArrowRight').priorities).toEqual([]);
    expect(applyRowKey(emptyFilter(), row('low'), 'Enter').priorities).toEqual(['low']);
  });

  it('cycles a choice both ways and wraps', () => {
    expect(applyRowKey(emptyFilter(), row('Branch'), 'ArrowRight').branch).toBe('has');
    expect(applyRowKey(emptyFilter(), row('Branch'), 'ArrowLeft').branch).toBe('none');
    expect(applyRowKey(emptyFilter(), row('Created'), 'ArrowRight').created).toBe('today');
    expect(applyRowKey(emptyFilter(), row('Subtasks'), 'ArrowLeft').family).toBe('parents');
  });

  it('clears everything on Reset', () => {
    const busy: BoardFilter = { ...emptyFilter(), text: 'x', branch: 'has', priorities: ['low'] };
    expect(applyRowKey(busy, row('Reset'), 'Enter')).toEqual(emptyFilter());
  });

  it('ignores keys a row does not take', () => {
    const start = emptyFilter();
    expect(applyRowKey(start, row('Branch'), 'x')).toBe(start);
    expect(applyRowKey(start, row('Text'), 'ArrowRight')).toBe(start);
  });
});

describe('dialogKey', () => {
  const plain = { modified: false };
  it('walks the rows with the arrows from any row', () => {
    expect(dialogKey(row('Text'), 'ArrowDown', plain)).toBe('next');
    expect(dialogKey(row('Branch'), 'ArrowUp', plain)).toBe('previous');
  });

  it('closes on Escape anywhere, and on Enter from the text row', () => {
    expect(dialogKey(row('urgent'), 'Escape', plain)).toBe('close');
    expect(dialogKey(row('Text'), 'Enter', plain)).toBe('close');
  });

  it('leaves typing in the text row to the box', () => {
    expect(dialogKey(row('Text'), 'a', plain)).toBe('ignore');
    expect(dialogKey(row('Text'), ' ', plain)).toBe('ignore');
  });

  it('edits on the keys a row takes, and closes on an Enter it does not', () => {
    expect(dialogKey(row('urgent'), 'Enter', plain)).toBe('edit');
    expect(dialogKey(row('Branch'), 'ArrowRight', plain)).toBe('edit');
    expect(dialogKey(row('Branch'), 'Enter', plain)).toBe('close');
    expect(dialogKey(row('Branch'), 'x', plain)).toBe('ignore');
  });

  it('leaves a modified key alone, except Tab, which never leaves the dialog', () => {
    expect(dialogKey(row('urgent'), ' ', { modified: true })).toBe('ignore');
    expect(dialogKey(row('urgent'), 'Escape', { modified: true })).toBe('ignore');
    expect(dialogKey(row('Text'), 'Tab', { modified: true })).toBe('swallow');
    expect(dialogKey(row('Branch'), 'Tab', plain)).toBe('swallow');
  });
});
