import { describe, expect, it } from 'vitest';
import { nextBudgetLimit, settingsRows, stepSelection, toggled, withBudgetPercentage, withWorkerCap } from './settings-rows';
import { ACTIONS } from '../../shared/keys/actions';
import { bindKey, defaultSettings, isOn, parseSettings } from '../../shared/settings/settings';

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

  it('lists every colour, the font, the shell, the weather place and the two resets', () => {
    const kinds = rows.map((row) => row.kind);
    expect(rows.filter((row) => row.kind === 'color')).toHaveLength(Object.keys(settings.theme).length);
    expect(kinds).toContain('font-name');
    expect(kinds).toContain('font-size');
    expect(kinds).toContain('shell');
    expect(kinds).toContain('weather-place');
    expect(kinds).toContain('reset-keys');
    expect(kinds).toContain('reset-all');
  });

  it('lists the host port and token under a Host heading', () => {
    const hosted = settingsRows(parseSettings({ host: { token: 'abc' } }, false));
    expect(hosted).toContainEqual({ kind: 'heading', label: 'Host' });
    expect(hosted).toContainEqual({ kind: 'host-port', label: 'Port (next launch)', value: '' });
    expect(hosted).toContainEqual({ kind: 'host-token', label: 'Token', value: 'abc' });
    const listening = settingsRows(parseSettings({ host: { port: 7777 } }, false));
    expect(listening).toContainEqual({ kind: 'host-port', label: 'Port (next launch)', value: '7777' });
  });

  it('lists the weekly cap under a Budget heading, empty when none is set', () => {
    const label = 'Weekly cap, % of the 7-day usage';
    const row = { kind: 'budget-percentage', field: 'weeklyCap', noun: 'cap', empty: 'not set', label };
    expect(settingsRows(parseSettings({}, false))).toContainEqual({ ...row, value: '' });
    expect(settingsRows(parseSettings({ budget: { weeklyCap: 74 } }, false))).toContainEqual({ ...row, value: '74' });
  });

  it('lists the workers cap, empty for none, and takes a whole number from 1 or empty', () => {
    const label = 'Main\'s workers running at once, across the app';
    expect(settingsRows(parseSettings({}, false))).toContainEqual({ kind: 'worker-cap', label, value: '4' });
    expect(settingsRows(parseSettings({ workers: { cap: 'none' } }, false))).toContainEqual({ kind: 'worker-cap', label, value: '' });
    const settings = parseSettings({}, false);
    expect(withWorkerCap(settings, '2')?.workers).toEqual({ cap: 2 });
    expect(withWorkerCap(settings, '')?.workers).toEqual({ cap: null });
    expect(['0', '2.5', 'lots'].map((text) => withWorkerCap(settings, text))).toEqual([null, null, null]);
  });

  it('names the limit that applies, and Enter walks the cap, the pace and none in turn', () => {
    const limitRow = (settings: ReturnType<typeof parseSettings>) => settingsRows(settings).find((row) => row.kind === 'budget-limit');
    let settings = parseSettings({ budget: { weeklyCap: 74 } }, false);
    expect(limitRow(settings)).toEqual({ kind: 'budget-limit', label: 'Hold the 7-day usage to', value: 'the weekly cap' });
    const walked = [];
    for (let step = 0; step < 3; step += 1) {
      settings = nextBudgetLimit(settings);
      walked.push(settings.budget.limit);
    }
    expect(walked).toEqual(['pace', 'none', 'cap']);
    expect(settings.budget.weeklyCap).toBe(74);
  });

  it('picks the limit a typed figure belongs to, and leaves it when the row is emptied', () => {
    const settings = parseSettings({ budget: { limit: 'none', weeklyCap: 74 } }, false);
    expect(withBudgetPercentage(settings, 'weeklyCap', 60).budget).toMatchObject({ limit: 'cap', weeklyCap: 60 });
    expect(withBudgetPercentage(settings, 'dailyShare', 15).budget).toMatchObject({ limit: 'pace', dailyShare: 15 });
    expect(withBudgetPercentage(settings, 'weeklyCap', null).budget).toMatchObject({ limit: 'none', weeklyCap: null });
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

describe('toggled', () => {
  it('turns one on/off setting over and leaves the others', () => {
    const off = toggled(settings, 'errors');
    expect(off.errors).toEqual({ notify: false });
    expect(off.updates).toEqual(settings.updates);
    expect(isOn(toggled(off, 'errors'), 'errors')).toBe(true);
    expect(settingsRows(off)).toContainEqual(expect.objectContaining({ kind: 'toggle', name: 'errors', value: 'off' }));
  });

  // Two toggles share the review section, so turning one over must keep the other.
  it('turns over a toggle that shares its section with another', () => {
    const merging = toggled(settings, 'autoMerge');
    expect(merging.review).toEqual({ autoLoop: settings.review.autoLoop, autoMerge: !settings.review.autoMerge });
  });
});
