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
  it('skips the headings in both directions', () => {
    const forward = stepSelection(rows, 1, 1);
    expect(rows[forward].kind).not.toBe('heading');
    const backward = stepSelection(rows, forward, -1);
    expect(backward).toBe(1);
  });

  it('stops at the ends rather than wrapping, so a long list has a top and a bottom', () => {
    expect(stepSelection(rows, 1, -1)).toBe(1);
    const last = stepSelection(rows, rows.length - 1, 0);
    expect(stepSelection(rows, last, 1)).toBe(last);
  });
});
