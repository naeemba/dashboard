import type { Mode } from './modes';
import type { Direction } from './terminals';

// What a shortcut does once it has fired. The renderer answers the first three groups; the board view
// answers the board kinds. Moved here from shortcuts.ts so the table can name the action beside its key.
export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-move'; index: number }
  | { kind: 'project-picker' }
  | { kind: 'project-last' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | { kind: 'mode-set'; mode: Mode }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' }
  | { kind: 'terminal-move'; direction: Direction }
  | { kind: 'terminal-input'; data: string }
  | { kind: 'board-select'; direction: Direction }
  | { kind: 'board-move'; direction: Direction }
  | { kind: 'board-attach' }
  | { kind: 'board-detach' }
  | { kind: 'board-edit'; field: 'title' | 'notes' }
  | { kind: 'board-open' }
  | { kind: 'board-add' }
  | { kind: 'board-delete' }
  | { kind: 'board-priority' }
  | { kind: 'board-sort' }
  | { kind: 'board-undo' };

// Which screens hear the key. `global` is heard everywhere, including while a shell has the keyboard;
// the other two only on their own screen, so the board's bare `D` never reaches a terminal.
export type ActionScope = 'global' | 'terminals' | 'board';

// Which heading the help dialog and the settings screen list it under. Not the same thing as scope:
// help and settings answer from everywhere but belong under their own heading rather than Projects.
export type ActionGroup = 'app' | 'modes' | 'projects' | 'terminals' | 'board';

export type ActionEntry = {
  // Stable: it is the key in settings.json, so renaming one loses whatever the user had bound to it.
  name: string;
  // The sentence the help dialog prints, written for someone who has not been told.
  description: string;
  group: ActionGroup;
  scope: ActionScope;
  action: Action;
  // What it ships with, per platform. null means it ships unbound.
  mac: string | null;
  other: string | null;
  // The rows the help dialog may print as one, and the sentence it prints for them. Only the numbered
  // runs have these: nine rows saying "Jump to project 4" is not a help dialog, it is a list.
  family?: string;
  familyDescription?: string;
};

const DIRECTIONS: Direction[] = ['left', 'down', 'up', 'right'];
// Option+H/J/K/L, the vim directions, in the same order as DIRECTIONS above.
const VIM_KEYS: Record<Direction, string> = { left: 'H', down: 'J', up: 'K', right: 'L' };
const ARROW_KEYS: Record<Direction, string> = { left: 'Left', down: 'Down', up: 'Up', right: 'Right' };

function range(count: number): number[] {
  return Array.from({ length: count }, (_value, index) => index + 1);
}

// A flat list of rows. It is data, so its length is not a design smell — the file-size rule already
// says so — and every consumer reads it rather than writing its own copy.
export const ACTIONS: readonly ActionEntry[] = [
  {
    name: 'project-picker', description: 'Open the project list', group: 'projects', scope: 'global',
    action: { kind: 'project-picker' }, mac: 'Ctrl+S', other: 'Ctrl+S',
  },
  {
    name: 'project-last', description: 'Back to the last project', group: 'projects', scope: 'global',
    action: { kind: 'project-last' }, mac: 'Ctrl+O', other: 'Ctrl+O',
  },
  {
    name: 'project-next', description: 'Next project', group: 'projects', scope: 'global',
    action: { kind: 'project-next' }, mac: 'Cmd+]', other: 'Ctrl+]',
  },
  {
    name: 'project-previous', description: 'Previous project', group: 'projects', scope: 'global',
    action: { kind: 'project-previous' }, mac: 'Cmd+[', other: 'Ctrl+[',
  },
  ...range(9).map((number): ActionEntry => ({
    name: `project-jump-${number}`, description: `Jump to project ${number}`,
    group: 'projects', scope: 'global',
    action: { kind: 'project-jump', index: number - 1 },
    mac: `Ctrl+${number}`, other: `Ctrl+${number}`,
    family: 'project-jump', familyDescription: 'Jump to a project',
  })),
  ...range(9).map((number): ActionEntry => ({
    name: `project-move-${number}`, description: `Move this project to position ${number}`,
    group: 'projects', scope: 'global',
    action: { kind: 'project-move', index: number - 1 },
    mac: `Ctrl+Shift+${number}`, other: `Ctrl+Shift+${number}`,
    family: 'project-move', familyDescription: 'Move this project to that position',
  })),
  {
    name: 'help', description: 'Open this dialog', group: 'app', scope: 'global',
    action: { kind: 'help' }, mac: 'Ctrl+H', other: 'Ctrl+H',
  },
  {
    name: 'settings', description: 'Open the settings screen', group: 'app', scope: 'global',
    action: { kind: 'settings' }, mac: 'Ctrl+,', other: 'Ctrl+,',
  },
  {
    name: 'mode-terminals', description: 'Terminals mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'terminals' }, mac: 'Ctrl+T', other: 'Ctrl+T',
  },
  {
    name: 'mode-nvim', description: 'nvim mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'nvim' }, mac: 'Ctrl+N', other: 'Ctrl+N',
  },
  {
    name: 'mode-board', description: 'Board mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'board' }, mac: 'Ctrl+B', other: 'Ctrl+B',
  },
  // Ctrl+1..9 belongs to the projects on every platform, so off macOS there is no modifier left to
  // reach a pane by number. Shipping unbound is better than shipping a key that cannot work.
  ...range(5).map((number): ActionEntry => ({
    name: `terminal-focus-${number}`, description: `Focus terminal ${number}`,
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-focus', index: number - 1 },
    mac: `Cmd+${number}`, other: null,
    family: 'terminal-focus', familyDescription: 'Focus a terminal',
  })),
  {
    name: 'terminal-next', description: 'Next terminal', group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-next' }, mac: 'Cmd+Right', other: 'Ctrl+Right',
  },
  {
    name: 'terminal-previous', description: 'Previous terminal', group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-previous' }, mac: 'Cmd+Left', other: 'Ctrl+Left',
  },
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `terminal-move-${direction}`, description: `Move to the pane ${direction}`,
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-move', direction },
    mac: `Alt+${VIM_KEYS[direction]}`, other: `Alt+${VIM_KEYS[direction]}`,
  })),
  // Ghostty sends Ctrl+U for Cmd+Backspace, so zsh kills the whole line. xterm.js sends a plain
  // backspace, which eats one character. Elsewhere Ctrl+U already reaches the shell on its own, so
  // there is nothing to stand in for and this ships unbound.
  {
    name: 'terminal-clear-line', description: "Clear the shell's current line",
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-input', data: '\x15' }, mac: 'Cmd+Backspace', other: null,
  },
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `board-select-${direction}`, description: `Move the selection ${direction}`,
    group: 'board', scope: 'board',
    action: { kind: 'board-select', direction },
    mac: ARROW_KEYS[direction], other: ARROW_KEYS[direction],
  })),
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `board-move-${direction}`, description: `Move the card ${direction}`,
    group: 'board', scope: 'board',
    action: { kind: 'board-move', direction },
    mac: `Shift+${ARROW_KEYS[direction]}`, other: `Shift+${ARROW_KEYS[direction]}`,
  })),
  {
    name: 'board-attach', description: 'Make this card a subtask of the one above',
    group: 'board', scope: 'board', action: { kind: 'board-attach' }, mac: 'Tab', other: 'Tab',
  },
  {
    name: 'board-detach', description: 'Cut this card loose from its parent',
    group: 'board', scope: 'board', action: { kind: 'board-detach' }, mac: 'Shift+Tab', other: 'Shift+Tab',
  },
  {
    name: 'board-edit-title', description: "Edit the card's title",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'title' },
    mac: 'Enter', other: 'Enter',
  },
  {
    name: 'board-edit-notes', description: "Edit the card's description",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'notes' }, mac: 'E', other: 'E',
  },
  {
    name: 'board-open', description: 'Open the card: its notes, its parent, its subtasks',
    group: 'board', scope: 'board', action: { kind: 'board-open' }, mac: 'O', other: 'O',
  },
  {
    name: 'board-add', description: 'Add a card',
    group: 'board', scope: 'board', action: { kind: 'board-add' }, mac: 'N', other: 'N',
  },
  {
    name: 'board-delete', description: 'Delete the card and its subtasks, after a confirmation',
    group: 'board', scope: 'board', action: { kind: 'board-delete' }, mac: 'D', other: 'D',
  },
  {
    name: 'board-priority', description: "Cycle the card's priority",
    group: 'board', scope: 'board', action: { kind: 'board-priority' }, mac: 'P', other: 'P',
  },
  {
    name: 'board-sort', description: 'Sort the column, urgent first',
    group: 'board', scope: 'board', action: { kind: 'board-sort' }, mac: 'S', other: 'S',
  },
  {
    name: 'board-undo', description: 'Undo the last board change',
    group: 'board', scope: 'board', action: { kind: 'board-undo' }, mac: 'U', other: 'U',
  },
];

export type ActionName = (typeof ACTIONS)[number]['name'];

export function defaultBinding(entry: ActionEntry, isMac: boolean): string | null {
  return isMac ? entry.mac : entry.other;
}

export function actionByName(name: string): ActionEntry | undefined {
  return ACTIONS.find((entry) => entry.name === name);
}
