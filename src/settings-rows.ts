import { ACTIONS, type ActionGroup } from './actions';
import type { Settings } from './settings';

// One line of the settings screen. Headings are printed and walked past; everything else can be
// selected and changed. Kept apart from the view so the walking is testable without a browser.
export type SettingsRow =
  | { kind: 'heading'; label: string }
  | { kind: 'key'; name: string; label: string; binding: string | null }
  | { kind: 'color'; name: string; label: string; value: string }
  | { kind: 'font-name'; label: string; value: string }
  | { kind: 'font-size'; label: string; value: string }
  | { kind: 'shell'; label: string; value: string }
  | { kind: 'reset-keys'; label: string }
  | { kind: 'reset-all'; label: string };

const GROUP_TITLES: Record<ActionGroup, string> = {
  app: 'Dashboard',
  modes: 'Modes',
  projects: 'Projects',
  terminals: 'Terminals',
  board: 'Board',
};

const GROUP_ORDER: ActionGroup[] = ['app', 'modes', 'projects', 'terminals', 'board'];

export function settingsRows(settings: Settings): SettingsRow[] {
  const rows: SettingsRow[] = [];
  for (const group of GROUP_ORDER) {
    rows.push({ kind: 'heading', label: GROUP_TITLES[group] });
    // Every action, bound or not. The help dialog leaves out the unbound ones because you cannot press
    // them; this is the screen where you give one a key, so it has to show them.
    for (const entry of ACTIONS) {
      if (entry.group !== group) continue;
      rows.push({
        kind: 'key', name: entry.name, label: entry.description, binding: settings.keys[entry.name],
      });
    }
  }
  rows.push({ kind: 'heading', label: 'Colours' });
  for (const [name, value] of Object.entries(settings.theme)) {
    rows.push({ kind: 'color', name, label: name, value });
  }
  rows.push({ kind: 'heading', label: 'Font' });
  rows.push({ kind: 'font-name', label: 'Font', value: settings.font.name });
  rows.push({ kind: 'font-size', label: 'Size', value: String(settings.font.size) });
  rows.push({ kind: 'heading', label: 'Shell' });
  rows.push({
    kind: 'shell', label: 'Shell command', value: settings.shellCommand,
  });
  rows.push({ kind: 'heading', label: 'Reset' });
  rows.push({ kind: 'reset-keys', label: 'Reset every key to its default' });
  rows.push({ kind: 'reset-all', label: 'Reset everything to defaults' });
  return rows;
}

// Headings are walked past, not landed on. A step of 0 finds the nearest selectable row at or after
// the index, which is how the screen opens on the first real row rather than on a heading.
export function stepSelection(rows: SettingsRow[], index: number, step: number): number {
  const forward = step >= 0;
  for (let at = index + step; at >= 0 && at < rows.length; at += forward ? 1 : -1) {
    if (rows[at].kind !== 'heading') return at;
  }
  // Nothing further that way: stay put. A list this long is easier to keep your place in when the top
  // and the bottom are ends rather than a loop back round.
  return index;
}
