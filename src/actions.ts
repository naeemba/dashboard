import { projectPosition } from './manager';
import { sectionIndex } from './manager-sections';
import type { Mode } from './modes';
import { TERMINAL_COUNT, type Direction } from './terminals';

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
  | { kind: 'worktrees' }
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
  | { kind: 'board-edit'; field: 'title' | 'notes' | 'branch' | 'pullRequest' }
  | { kind: 'board-open' }
  | { kind: 'board-add' }
  | { kind: 'board-delete' }
  | { kind: 'board-priority' }
  | { kind: 'board-sort' }
  | { kind: 'board-undo' }
  | { kind: 'cards-project'; direction: 'previous' | 'next' }
  | { kind: 'manager-select'; direction: 'up' | 'down' }
  | { kind: 'manager-open' };

// Which screens hear the key. `global` is heard everywhere, including while a shell has the keyboard.
// `terminals`, `board`, `manager` and `command` are each heard only on their own screen, so the
// board's bare `D` never reaches a terminal.
//
// `manager-page` is the one that is not a mode: it means any section of the manager, whichever of its
// three views is showing. The strip keys need it, because they have to work on all three and an action
// may name only one scope — two rows sharing a binding is what this app already treats as a
// hand-edited settings file. It cannot be answered from the mode alone, because `board` is a mode the
// manager shares with every project, so `hears` is told which page you are on.
export type ActionScope = 'global' | 'terminals' | 'board' | 'manager' | 'command' | 'manager-page';

// Whether two actions can be heard at the same moment, which is the whole of what "these two want the
// same key" means. Exported because two places ask it and they must not each hold their own idea of
// it: `hears` decides whether a key fires, and the settings screen decides whether to warn you that
// something else already has it. Let those drift and the screen offers you a key that silently loses
// to another one — or warns about a clash that cannot happen.
//
// Scopes are not a flat list of equals: `global` is heard everywhere, and `manager-page` covers the
// three modes the manager shows.
export function scopesOverlap(one: ActionScope, other: ActionScope): boolean {
  if (one === 'global' || other === 'global' || one === other) return true;
  const pair = [one, other];
  return pair.includes('manager-page')
    && pair.some((scope) => scope !== 'manager-page' && sectionIndex(scope as Mode) !== -1);
}

// Which heading the help dialog and the settings screen list it under. Not the same thing as scope:
// help and settings answer from everywhere but belong under their own heading rather than Projects.
export type ActionGroup = 'app' | 'modes' | 'projects' | 'terminals' | 'board' | 'manager';

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
  // runs have these: nine rows saying "Jump to tab 4" is not a help dialog, it is a list.
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
//
// One thing to know before picking a mac default: Ctrl with an arrow belongs to macOS. Ctrl+Up is
// Mission Control and Ctrl+Down is Application windows, both on out of the box, and the system takes
// them before the app is told. A row that ships one on the mac side ships a key that does nothing
// until the person finds the settings screen. Cmd with an arrow is free.
export const ACTIONS: readonly ActionEntry[] = [
  {
    name: 'project-picker', description: 'Open the project list', group: 'projects', scope: 'global',
    action: { kind: 'project-picker' }, mac: 'Ctrl+S', other: 'Ctrl+S',
  },
  {
    name: 'project-last', description: 'Back to the last tab', group: 'projects', scope: 'global',
    action: { kind: 'project-last' }, mac: 'Ctrl+O', other: 'Ctrl+O',
  },
  {
    name: 'project-next', description: 'Next tab', group: 'projects', scope: 'global',
    action: { kind: 'project-next' }, mac: 'Cmd+]', other: 'Ctrl+]',
  },
  {
    name: 'project-previous', description: 'Previous tab', group: 'projects', scope: 'global',
    action: { kind: 'project-previous' }, mac: 'Cmd+[', other: 'Ctrl+[',
  },
  ...range(9).map((number): ActionEntry => ({
    // Counted the way the tab strip is, where tab 1 is the manager rather than a project.
    name: `project-jump-${number}`, description: `Jump to tab ${number}`,
    group: 'projects', scope: 'global',
    action: { kind: 'project-jump', index: number - 1 },
    mac: `Ctrl+${number}`, other: `Ctrl+${number}`,
    family: 'project-jump', familyDescription: 'Jump to a tab',
  })),
  ...range(9).map((number): ActionEntry => {
    const index = number - 1;
    return {
      name: `project-move-${number}`,
      // Where the key actually lands it, asked of the same function the move itself asks: the manager
      // owns tab 1, so the first two keys both land a project in tab 2 and both say so.
      description: `Move this project to tab ${projectPosition(index) + 1}`,
      group: 'projects', scope: 'global',
      action: { kind: 'project-move', index },
      mac: `Ctrl+Shift+${number}`, other: `Ctrl+Shift+${number}`,
      family: 'project-move', familyDescription: 'Move this project to that tab',
    };
  }),
  {
    name: 'help', description: 'Open this dialog', group: 'app', scope: 'global',
    action: { kind: 'help' }, mac: 'Ctrl+H', other: 'Ctrl+H',
  },
  {
    name: 'settings', description: 'Open the settings screen', group: 'app', scope: 'global',
    action: { kind: 'settings' }, mac: 'Ctrl+,', other: 'Ctrl+,',
  },
  // Shift on purpose. Bare Ctrl+W is backward-kill-word in bash, zsh and vim's insert mode, and this
  // is global scope, so binding it would take a key every pane uses all day. matchesBinding compares
  // every modifier, so the bare one matches nothing here and falls through to the shell.
  {
    name: 'worktrees', description: 'List the worktrees cards were shipped into',
    group: 'app', scope: 'global',
    action: { kind: 'worktrees' }, mac: 'Ctrl+Shift+W', other: 'Ctrl+Shift+W',
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
  ...range(TERMINAL_COUNT).map((number): ActionEntry => ({
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
    name: 'board-edit-branch', description: "Edit the card's branch",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'branch' }, mac: 'B', other: 'B',
  },
  {
    name: 'board-edit-pull-request', description: "Edit the card's pull request number",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'pullRequest' }, mac: 'R', other: 'R',
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
  // The manager's board is every open project's board stacked, and these say which of them the rest of
  // the keys reach. Board scope, because that screen is a board and hears what a board hears — so a
  // project's own board hears them too and has nowhere to go, the way a mode key does nothing on a
  // page with no such view.
  {
    name: 'cards-project-previous', description: "The previous project's board, on the manager",
    group: 'board', scope: 'board', action: { kind: 'cards-project', direction: 'previous' },
    mac: 'Cmd+Up', other: 'Ctrl+Up',
  },
  {
    name: 'cards-project-next', description: "The next project's board, on the manager",
    group: 'board', scope: 'board', action: { kind: 'cards-project', direction: 'next' },
    mac: 'Cmd+Down', other: 'Ctrl+Down',
  },
  // The way back off the manager's board, which is the one board with a list behind it. Grouped with
  // the board keys rather than the mode keys so it is only printed on a board — the modes group is
  // printed on every screen, and Escape is not heard on any of the others.
  {
    name: 'mode-manager', description: "Back to the manager's list, from its board",
    group: 'board', scope: 'board', action: { kind: 'mode-set', mode: 'manager' },
    mac: 'Escape', other: 'Escape',
  },
  // Bare arrows and a bare Enter, which only this screen hears. The manager does take typing — a
  // character on a waiting row goes to that pane's shell — and these keys are safe from it because the
  // window's one lookup matches them first and stops them here. A bare key added to this group is a
  // key the manager can no longer send, so add one only if it should never reach a pane.
  ...(['up', 'down'] as const).map((direction): ActionEntry => ({
    name: `manager-select-${direction}`, description: `Move the selection ${direction}`,
    group: 'manager', scope: 'manager',
    action: { kind: 'manager-select', direction },
    mac: ARROW_KEYS[direction], other: ARROW_KEYS[direction],
  })),
  {
    name: 'manager-open', description: "Show a project's panes, or go to the pane",
    group: 'manager', scope: 'manager', action: { kind: 'manager-open' }, mac: 'Enter', other: 'Enter',
  },
];

export function defaultBinding(entry: ActionEntry, isMac: boolean): string | null {
  return isMac ? entry.mac : entry.other;
}

export function actionByName(name: string): ActionEntry | undefined {
  return ACTIONS.find((entry) => entry.name === name);
}
