import { ACTIONS, defaultBinding, type ActionEntry } from './actions';
import type { Mode } from './modes';
import type { Settings } from './settings';
import { passesThrough } from './shortcuts';

// One row of a list of keys: what you press, and what it does. Two screens print such a list — the
// help dialog and the which-key strip — and this is the shape they both print.
export type Shortcut = { keys: string; action: string };

// What a row says instead of its description when its key is passed through to the screen it names.
// One sentence, said by both lists, because it is one fact about the key.
export const PASSED_THROUGH = 'already here — the screen gets the keystroke';

// Which rows a list wants, and what each one's keys are called on it. The help dialog wants one group
// and spells the whole binding; the which-key strip wants what the screen can hear and spells only
// what is left to press. Everything else about the two lists is the same, and that sameness is this
// file: they must not each keep their own idea of when a numbered run may print as a range, or of what
// a passed-through key says.
export type RowSource = {
  wants(entry: ActionEntry): boolean;
  // Null is an action with no row: the help dialog will not print a key you cannot press, and the
  // strip will not print one the modifiers you are holding cannot reach.
  label(entry: ActionEntry): string | null;
  mode: Mode;
  keys: Settings['keys'];
  isMac: boolean;
};

// Whether every row of a numbered run still holds the key it shipped with.
function isUntouched(entries: ActionEntry[], keys: Settings['keys'], isMac: boolean): boolean {
  return entries.every((entry) => keys[entry.name] === defaultBinding(entry, isMac));
}

// A numbered run — the nine project keys, the five pane keys — prints as one row while all of it is
// listed and none of it has been rebound. Move one and every one is spelled out, because "1…9" would
// then be naming a key that does something else.
function familyRow(entries: ActionEntry[], source: RowSource): Shortcut[] {
  const shown = entries
    .map((entry) => ({ entry, keys: source.label(entry) }))
    .filter((row): row is { entry: ActionEntry; keys: string } => row.keys !== null);
  if (shown.length === 0) return [];
  if (shown.length === entries.length && entries.length > 1
    && isUntouched(entries, source.keys, source.isMac)) {
    return [{
      keys: `${shown[0].keys}…${shown[shown.length - 1].keys}`,
      action: entries[0].familyDescription ?? entries[0].description,
    }];
  }
  return shown.map((row) => ({ keys: row.keys, action: row.entry.description }));
}

// The action table, in its own order, as rows of keys. Table order is already grouped, so nothing here
// sorts: what the list wants and what it calls a key is the whole of what a caller decides.
export function shortcutRows(source: RowSource): Shortcut[] {
  const rows: Shortcut[] = [];
  const families = new Set<string>();
  for (const entry of ACTIONS) {
    if (!source.wants(entry)) continue;
    if (entry.family !== undefined) {
      if (families.has(entry.family)) continue;
      families.add(entry.family);
      rows.push(...familyRow(ACTIONS.filter((row) => row.family === entry.family), source));
      continue;
    }
    const keys = source.label(entry);
    if (keys === null) continue;
    // The key naming the mode you are already on is listed too — it is passed through to whatever runs
    // there, and that is worth saying rather than leaving it a mystery.
    rows.push({ keys, action: passesThrough(entry, source.mode) ? PASSED_THROUGH : entry.description });
  }
  return rows;
}
