import { MODE_KEYS, type Mode } from './modes';
import { openOverlay } from './overlay';

// One row of the help dialog: the keys you press, and what they do.
export type Shortcut = { keys: string; action: string };
// The blurb says what the screen is; the shortcuts say how to work it. A key list on its own teaches
// someone the gestures and not the thing they are gestures for.
export type Section = { title: string; blurb: string; shortcuts: Shortcut[] };

const MODE_NAMES: Record<Mode, string> = { terminals: 'Terminals', nvim: 'nvim', board: 'Board' };

// Spelled out rather than left as "Mod", so the row names the key you actually press.
function modifier(isMac: boolean): string {
  return isMac ? 'Cmd' : 'Ctrl';
}

// Ctrl+T, Ctrl+N and Ctrl+B, read off the same table the handler uses, so a mode added later shows up
// here without anyone remembering to add it. The key naming the mode you are on is listed too — it is
// passed through to whatever runs there, and that is worth saying rather than leaving it a mystery.
function modeShortcuts(mode: Mode): Shortcut[] {
  return Object.entries(MODE_KEYS).map(([letter, named]) => ({
    keys: `Ctrl+${letter.toUpperCase()}`,
    action: named === mode ? 'already here — the screen gets the keystroke' : `${MODE_NAMES[named]} mode`,
  }));
}

function terminalShortcuts(isMac: boolean): Shortcut[] {
  const modifierName = modifier(isMac);
  return [
    // Ctrl+1..9 belongs to the projects everywhere, so off macOS there is no Mod left to reach a pane by
    // number. Listing a key that cannot work would be worse than leaving it out.
    ...(isMac ? [{ keys: 'Cmd+1…5', action: 'Focus a terminal' }] : []),
    { keys: `${modifierName}+Right / ${modifierName}+Left`, action: 'Next / previous terminal' },
    { keys: `${isMac ? 'Option' : 'Alt'}+H J K L`, action: 'Move to the pane left, down, up, right' },
    ...(isMac ? [{ keys: 'Cmd+Backspace', action: "Clear the shell's current line" }] : []),
  ];
}

// Written out rather than read off a table: the board's keys live in a switch in board-view.ts, and
// they have reasons to stay there — a title and a description commit on different keys, and an arrow
// means something else with Shift held. Nine rows do not pay for the table that would keep them in
// step, so adding a board key means adding a row here too.
const BOARD_SHORTCUTS: Shortcut[] = [
  { keys: 'Arrows', action: 'Move the selection' },
  { keys: 'Shift+Arrows', action: 'Move the card itself' },
  { keys: 'Tab', action: 'Make this card a subtask of the one above' },
  { keys: 'Shift+Tab', action: 'Cut this card loose from its parent' },
  { keys: 'Enter', action: "Edit the card's title" },
  { keys: 'e', action: "Edit the card's description" },
  { keys: 'o', action: "Open the card: its notes, its parent, its subtasks" },
  { keys: 'n', action: 'Add a card' },
  { keys: 'd', action: 'Delete the card and its subtasks, after a confirmation' },
  { keys: 'p', action: "Cycle the card's priority" },
  { keys: 's', action: 'Sort the column, urgent first' },
  { keys: 'u', action: 'Undo the last board change' },
];

// nvim owns its own keys; the dashboard adds none. Saying so is the answer to "what can I press here",
// even though the list is empty.
const NVIM_SHORTCUTS: Shortcut[] = [
  { keys: 'Everything else', action: 'Goes straight to nvim' },
];

// What each screen is, for the person who has not been told. The things worth knowing here are the ones
// that are not visible on screen: that a shell survives leaving the page, that nvim is not running yet,
// that the board has no save key.
const SCREEN_BLURBS: Record<Mode, string> = {
  terminals: 'Five shells in a fixed grid. They keep running while you are on another project or another '
    + 'view, so a long job is still going when you come back.',
  nvim: 'One nvim filling the window. It starts the first time you press Ctrl+N for this project, not at '
    + 'launch. Quit it and the pane says it exited; Enter starts it again.',
  board: 'A kanban board kept in .dashboard/board.json inside the project. Every change is written '
    + 'straight to disk, so there is no save key and u is the only way back. The file is re-read each '
    + 'time you enter the board, not while you are looking at it. A card can be a subtask of another '
    + 'card: it stays an ordinary card in whatever column you put it in, shows a badge naming its '
    + 'parent, and counts towards the bar on that parent.',
};

function screenShortcuts(mode: Mode, isMac: boolean): Shortcut[] {
  if (mode === 'board') return BOARD_SHORTCUTS;
  if (mode === 'nvim') return NVIM_SHORTCUTS;
  return terminalShortcuts(isMac);
}

// The screen you are on comes first: it is what you pressed Ctrl+H to ask about. The keys that answer
// from everywhere follow, since they are the ones you already half know.
export function helpSections(mode: Mode, isMac: boolean): Section[] {
  const modifierName = modifier(isMac);
  return [
    { title: MODE_NAMES[mode], blurb: SCREEN_BLURBS[mode], shortcuts: screenShortcuts(mode, isMac) },
    {
      title: 'Modes',
      blurb: 'A project is shown three ways and remembers which one you left it on, so jumping to it '
        + 'lands you back in the same view.',
      shortcuts: modeShortcuts(mode),
    },
    {
      // Written out for the same reason as the board keys: mapShortcut has to read `code` on the digits
      // and `key` on the brackets, and swaps modifier by platform, so there is no table to read back.
      // A project key added there needs a row added here.
      title: 'Projects',
      blurb: 'One page per project, in the order along the top. The window opens on the projects the '
        + 'last run was left on, and closing it asks first, because it kills every shell in every '
        + 'project.',
      shortcuts: [
        { keys: 'Ctrl+S', action: 'Open the project list' },
        { keys: 'Ctrl+O', action: 'Back to the last project' },
        { keys: 'Ctrl+1…9', action: 'Jump to a project' },
        { keys: 'Ctrl+Shift+1…9', action: 'Move this project to that position' },
        { keys: `${modifierName}+] / ${modifierName}+[`, action: 'Next / previous project' },
      ],
    },
  ];
}

// Read-only, so there is nothing to walk over: Escape or Enter closes it and the arrows scroll a list
// too long for the dialog.
export function openHelp(mode: Mode, isMac: boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('help', close);
    // Not reachable by Tab, but focusable, so the dialog can take the keyboard while it is up.
    dialog.tabIndex = -1;

    for (const section of helpSections(mode, isMac)) {
      const heading = document.createElement('h2');
      heading.textContent = section.title;
      const blurb = document.createElement('p');
      blurb.className = 'help-blurb';
      blurb.textContent = section.blurb;
      const list = document.createElement('ul');
      list.className = 'help-list';
      list.append(...section.shortcuts.map((shortcut) => {
        const row = document.createElement('li');
        const keys = document.createElement('span');
        keys.className = 'help-keys';
        keys.textContent = shortcut.keys;
        const action = document.createElement('span');
        action.className = 'help-action';
        action.textContent = shortcut.action;
        row.append(keys, action);
        return row;
      }));
      dialog.append(heading, blurb, list);
    }

    const footer = document.createElement('p');
    footer.className = 'help-footer';
    footer.textContent = 'Ctrl+H opens this. Escape or Enter closes it.';
    dialog.append(footer);
    dialog.focus();

    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      close();
    });
  });
}
