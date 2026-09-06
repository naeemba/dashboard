import { MODE_KEYS, type Mode } from './modes';

// One row of the help dialog: the keys you press, and what they do.
export type Shortcut = { keys: string; action: string };
export type Section = { title: string; shortcuts: Shortcut[] };

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
    action: named === mode ? `already here — goes to ${MODE_NAMES[mode]} instead` : `${MODE_NAMES[named]} mode`,
  }));
}

function terminalShortcuts(isMac: boolean): Shortcut[] {
  const mod = modifier(isMac);
  return [
    // Ctrl+1..9 belongs to the projects everywhere, so off macOS there is no Mod left to reach a pane by
    // number. Listing a key that cannot work would be worse than leaving it out.
    ...(isMac ? [{ keys: 'Cmd+1…5', action: 'Focus a terminal' }] : []),
    { keys: `${mod}+Right / ${mod}+Left`, action: 'Next / previous terminal' },
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
  { keys: 'Enter', action: "Edit the card's title" },
  { keys: 'e', action: "Edit the card's description" },
  { keys: 'n', action: 'Add a card' },
  { keys: 'd', action: 'Delete the card' },
  { keys: 'p', action: "Cycle the card's priority" },
  { keys: 's', action: 'Sort the column, urgent first' },
  { keys: 'u', action: 'Undo the last board change' },
];

// nvim owns its own keys; the dashboard adds none. Saying so is the answer to "what can I press here",
// even though the list is empty.
const NVIM_SHORTCUTS: Shortcut[] = [
  { keys: 'Everything else', action: 'Goes straight to nvim' },
];

function screenShortcuts(mode: Mode, isMac: boolean): Shortcut[] {
  if (mode === 'board') return BOARD_SHORTCUTS;
  if (mode === 'nvim') return NVIM_SHORTCUTS;
  return terminalShortcuts(isMac);
}

// The screen you are on comes first: it is what you pressed Ctrl+H to ask about. The keys that answer
// from everywhere follow, since they are the ones you already half know.
export function helpSections(mode: Mode, isMac: boolean): Section[] {
  const mod = modifier(isMac);
  return [
    { title: MODE_NAMES[mode], shortcuts: screenShortcuts(mode, isMac) },
    { title: 'Modes', shortcuts: modeShortcuts(mode) },
    {
      // Written out for the same reason as the board keys: mapShortcut has to read `code` on the digits
      // and `key` on the brackets, and swaps modifier by platform, so there is no table to read back.
      // A project key added there needs a row added here.
      title: 'Projects',
      shortcuts: [
        { keys: 'Ctrl+S', action: 'Open the project list' },
        { keys: 'Ctrl+O', action: 'Back to the last project' },
        { keys: 'Ctrl+1…9', action: 'Jump to a project' },
        { keys: 'Ctrl+Shift+1…9', action: 'Move this project to that position' },
        { keys: `${mod}+] / ${mod}+[`, action: 'Next / previous project' },
      ],
    },
  ];
}

// Read-only, so there is nothing to walk over: Escape or Enter closes it and the arrows scroll a list
// too long for the dialog.
export function openHelp(mode: Mode, isMac: boolean): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'help';
  const dialog = document.createElement('div');
  dialog.className = 'help-dialog';
  // Not reachable by Tab, but focusable, so the dialog can take the keyboard while it is up.
  dialog.tabIndex = -1;

  for (const section of helpSections(mode, isMac)) {
    const heading = document.createElement('h2');
    heading.textContent = section.title;
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
    dialog.append(heading, list);
  }

  const footer = document.createElement('p');
  footer.className = 'help-footer';
  footer.textContent = 'Ctrl+H opens this. Escape closes it.';
  dialog.append(footer);
  overlay.append(dialog);
  document.body.append(overlay);
  dialog.focus();

  return new Promise<void>((resolve) => {
    function close(): void {
      overlay.remove();
      resolve();
    }
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      close();
    });
    // Only the dark margin around the dialog dismisses it, the same as the picker. Without the check a
    // click meant to select a key name closes the dialog under the pointer.
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
  });
}
