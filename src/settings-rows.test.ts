import { describe, expect, it } from 'vitest';
import { settingsRows, stepSelection } from './settings-rows';
import { ACTIONS } from './actions';
import { bindKey, defaultSettings } from './settings';

const settings = defaultSettings(true);
const rows = settingsRows(settings);

describe('settingsRows', () => {
  it('lists every action, bound or not, unlike the help dialog', () => {
    const unbound = settingsRows(bindKey(settings, 'help', null));
    const keyRows = unbound.filter((row) => row.kind === 'key');
    const named = keyRows.map((row) => row.name);
    // Set, not list: the screen groups its rows in its own order, which is not the table's.
    expect(new Set(named)).toEqual(new Set(ACTIONS.map((entry) => entry.name)));
    expect(named).toHaveLength(ACTIONS.length);
    expect(keyRows.find((row) => row.name === 'help')?.binding).toBeNull();
  });

  it('lists every colour, the font, the shell and the two resets', () => {
    const kinds = rows.map((row) => row.kind);
    expect(rows.filter((row) => row.kind === 'color')).toHaveLength(Object.keys(settings.theme).length);
    expect(kinds).toContain('font-name');
    expect(kinds).toContain('font-size');
    expect(kinds).toContain('shell');
    expect(kinds).toContain('reset-keys');
    expect(kinds).toContain('reset-all');
  });

  it('opens with a heading, and headings are not selectable', () => {
    expect(rows[0].kind).toBe('heading');
    expect(stepSelection(rows, 0, 0)).toBe(1);
  });
});

describe('stepSelection', () => {
  it('skips a heading in both directions', () => {
    // Found from the rows rather than written as a literal index: the row counts shift the moment
    // anyone adds an action to a group, and a test pinned to "index 4" would stop meaning anything
    // the day that happens without anyone noticing.
    const headingIndex = rows.findIndex((row, index) => (
      row.kind === 'heading' && index > 0 && rows[index - 1].kind !== 'heading'
      && index + 1 < rows.length && rows[index + 1].kind !== 'heading'
    ));
    expect(headingIndex).toBeGreaterThan(-1);
    const before = headingIndex - 1;
    const after = headingIndex + 1;
    expect(stepSelection(rows, before, 1)).toBe(after);
    expect(stepSelection(rows, after, -1)).toBe(before);
  });

  it('never lands on a heading, walking the whole list either way', () => {
    // One hop can pass by luck even with the skip removed, if the row it happens to land on is not a
    // heading anyway. Walking every stop from one end to the other is what actually shows the loop
    // keeps going past a heading rather than landing on it, and that it eventually stops moving.
    function walk(direction: 1 | -1): number[] {
      const start = direction === 1 ? stepSelection(rows, 0, 0) : stepSelection(rows, rows.length - 1, 0);
      const visited = [start];
      let at = start;
      for (;;) {
        const next = stepSelection(rows, at, direction);
        if (next === at) break;
        visited.push(next);
        at = next;
      }
      return visited;
    }

    const forward = walk(1);
    const backward = walk(-1);
    for (const index of forward) expect(rows[index].kind).not.toBe('heading');
    // Walked from the other end, the same stops come back in reverse.
    expect([...backward].reverse()).toEqual(forward);
  });

  it('stops at the ends rather than wrapping, so a long list has a top and a bottom', () => {
    expect(stepSelection(rows, 1, -1)).toBe(1);
    const last = stepSelection(rows, rows.length - 1, 0);
    expect(stepSelection(rows, last, 1)).toBe(last);
  });
});
