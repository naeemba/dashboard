import { ACTIONS, defaultBinding, type ActionEntry, type ActionGroup } from './actions';
import { type Mode } from './modes';
import { openOverlay } from './overlay';
import type { Settings } from './settings';
import { isModified } from './shortcuts';

// One row of the help dialog: the keys you press, and what they do.
export type Shortcut = { keys: string; action: string };
// The blurb says what the screen is; the shortcuts say how to work it. A key list on its own teaches
// someone the gestures and not the thing they are gestures for.
export type Section = { title: string; blurb: string; shortcuts: Shortcut[] };

export const MODE_NAMES: Record<Mode, string> = {
  terminals: 'Terminals', nvim: 'nvim', board: 'Board', manager: 'Manager',
};

// What each screen and each group is, for the person who has not been told. The things worth knowing
// are the ones that are not visible: that a shell survives leaving the page, that nvim is not running
// yet, that the board has no save key, that settings are a file you can also edit by hand.
const BLURBS: Record<Mode | ActionGroup, string> = {
  terminals: 'Five shells in a fixed grid. They keep running while you are on another project or '
    + 'another view, so a long job is still going when you come back. A pane that rings the terminal '
    + 'bell to ask for you puts a pulsing red dot on its project along the top, turns that name '
    + 'yellow and says which pane on the right, and raises a system notification once if the window '
    + 'is behind something else. Clicking that notification brings the app forward on that pane. '
    + 'Going to the pane clears it. A bell is checked a second later against what the pane has on '
    + 'screen, so an agent that rings on its way past something and keeps working is left alone.',
  nvim: 'One nvim filling the window. It starts the first time you press the nvim key for this '
    + 'project, not at launch. Quit it and the pane says it exited; Enter starts it again.',
  board: 'A kanban board kept in .dashboard/board.json inside the project. Every change is written '
    + 'straight to disk, so there is no save key and undo is the only way back. The file is re-read '
    + 'each time you enter the board, not while you are looking at it. A card can be a subtask of '
    + 'another card: it stays an ordinary card in whatever column you put it in, shows a badge naming '
    + 'its parent, and counts towards the bar on that parent. A card also carries the branch and pull '
    + 'request its work is on, which you type in, and the dates it was written and last changed, which '
    + 'the app keeps for you and shows when you open the card. '
    + 'The manager has one of these too, and it is every open project\'s board at once, one under the '
    + 'other. The same keys and the same writes — each project keeps its own undo — with two more that '
    + 'say which project the rest of them are aimed at, and Escape to go back to the manager\'s list.',
  manager: 'The first tab, and the only page that is not a project: no folder and no shells, so the '
    + 'terminal and nvim keys do nothing here. It is where the window lands when nothing was open last '
    + 'time, and it has two views. The board key shows the other one — every open project\'s board, '
    + 'stacked, with the cards editable where they sit. '
    + 'This one lists every open project and what its panes want from you — one asking a question, one that '
    + 'has died and needs starting again. Enter on a project shows those panes by name, each with the '
    + 'last few lines it printed, so the question can be read from here. Enter on a pane takes you '
    + 'straight there; a letter, digit or symbol is sent to it instead, which answers a menu without '
    + 'leaving this page and takes the pane off the list. Answering leaves nothing selected, so the '
    + 'next character is not typed into whichever pane moved up into the space — an arrow picks a row '
    + 'again. A pane that has died takes no keys — it '
    + 'wants Enter in the pane itself. A project with nothing to report says quiet and has nothing to '
    + 'open.',
  modes: 'A project is shown three ways and remembers which one you left it on, so jumping to it '
    + 'lands you back in the same view. The manager has two of its own: its list of what the panes '
    + 'want, and every project\'s board.',
  projects: 'The first tab along the top is the manager; every tab after it is one project, in the '
    + 'order you put them in. A project cannot be moved in front of the manager, so the first two move '
    + 'keys both land it in tab 2. The next and previous keys walk the whole strip, so they pass '
    + 'through the manager on the way round. The window opens on the projects the last run was left '
    + 'on, and closing it asks first, because it kills every shell in every project.',
  app: 'Every key on this list can be changed, and so can the colours, the font and the shell. They '
    + 'are kept in ~/.config/dashboard/settings.json, which you can also edit by hand. It holds only '
    + 'what you changed; anything you left alone follows the app\'s default, including when that '
    + 'default moves. The app tidies the file each time it starts, so a line you write that already '
    + 'matches the default is taken out again. '
    + 'Delete it and everything is back to how it shipped.',
};

// What a screen does with the keys no binding names, which is why these are written out rather than
// printed from the action table. nvim owns everything the dashboard did not claim, and on the manager
// a typed character is the answer the selected pane is waiting for, every named key there being bound
// already. Both are the answer to "what can I press here", so both are printed under the keys that do
// have names.
const UNBOUND_SHORTCUTS: Partial<Record<Mode, Shortcut[]>> = {
  nvim: [{ keys: 'Everything else', action: 'Goes straight to nvim' }],
  manager: [{ keys: 'A letter, digit or symbol', action: 'Straight to the selected waiting pane' }],
};

function isUntouched(entries: ActionEntry[], keys: Settings['keys'], isMac: boolean): boolean {
  return entries.every((entry) => keys[entry.name] === defaultBinding(entry, isMac));
}

// A numbered run — the nine project keys, the five pane keys — prints as one row while all of it still
// holds the keys it shipped with. Move one and every one is listed, because "Ctrl+1…Ctrl+9" would then
// be naming a key that does something else.
function familyRow(entries: ActionEntry[], keys: Settings['keys'], isMac: boolean): Shortcut[] {
  const bound = entries.filter((entry) => keys[entry.name] !== null);
  if (bound.length === 0) return [];
  if (bound.length === entries.length && entries.length > 1 && isUntouched(entries, keys, isMac)) {
    return [{
      keys: `${keys[bound[0].name]}…${keys[bound[bound.length - 1].name]}`,
      action: entries[0].familyDescription ?? entries[0].description,
    }];
  }
  return bound.map((entry) => ({ keys: keys[entry.name]!, action: entry.description }));
}

// An action with no key gets no row: this dialog answers "what can I press here", and you cannot press
// an unbound action. The settings screen is where every action is listed whether it has a key or not.
// `group` takes a Mode as well, because screenShortcuts asks for the group named after the screen you
// are on and nvim is a screen with no group: no action has it, so the list comes back empty and its
// keys are printed from UNBOUND_SHORTCUTS instead.
function groupShortcuts(
  group: ActionGroup | Mode, mode: Mode, keys: Settings['keys'], isMac: boolean,
): Shortcut[] {
  const rows: Shortcut[] = [];
  const families = new Set<string>();
  for (const entry of ACTIONS) {
    if (entry.group !== group) continue;
    if (entry.family !== undefined) {
      if (families.has(entry.family)) continue;
      families.add(entry.family);
      rows.push(...familyRow(ACTIONS.filter((row) => row.family === entry.family), keys, isMac));
      continue;
    }
    const binding = keys[entry.name];
    if (binding === null) continue;
    // The key naming the mode you are already in is listed too — it is passed through to whatever runs
    // there, and that is worth saying rather than leaving it a mystery.
    const passedThrough = entry.action.kind === 'mode-set' && entry.action.mode === mode;
    rows.push({
      keys: binding,
      action: passedThrough ? 'already here — the screen gets the keystroke' : entry.description,
    });
  }
  return rows;
}

// The group named after the screen, then whatever that screen takes without a binding. nvim has no
// group at all, so its list is only the second half.
function screenShortcuts(mode: Mode, keys: Settings['keys'], isMac: boolean): Shortcut[] {
  return [...groupShortcuts(mode, mode, keys, isMac), ...UNBOUND_SHORTCUTS[mode] ?? []];
}

// The screen you are on comes first: it is what you pressed the help key to ask about. The keys that
// answer from everywhere follow, since they are the ones you already half know.
export function helpSections(mode: Mode, keys: Settings['keys'], isMac: boolean): Section[] {
  const screen: Section = {
    title: MODE_NAMES[mode],
    blurb: BLURBS[mode],
    shortcuts: screenShortcuts(mode, keys, isMac),
  };
  const rest: readonly ('modes' | 'projects' | 'app')[] = ['modes', 'projects', 'app'];
  return [screen, ...rest.map((group) => ({
    title: { modes: 'Modes', projects: 'Projects', app: 'Dashboard' }[group],
    blurb: BLURBS[group],
    shortcuts: groupShortcuts(group, mode, keys, isMac),
  }))];
}

// Read-only, so there is nothing to walk over: Escape or Enter closes it and the arrows scroll a list
// too long for the dialog.
export function openHelp(mode: Mode, keys: Settings['keys'], isMac: boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('help', close);

    for (const section of helpSections(mode, keys, isMac)) {
      const heading = document.createElement('h2');
      heading.textContent = section.title;
      const blurb = document.createElement('p');
      blurb.className = 'help-blurb';
      blurb.textContent = section.blurb;
      const list = document.createElement('ul');
      list.className = 'help-list';
      list.append(...section.shortcuts.map((shortcut) => {
        const row = document.createElement('li');
        const keysSpan = document.createElement('span');
        keysSpan.className = 'help-keys';
        keysSpan.textContent = shortcut.keys;
        const action = document.createElement('span');
        action.className = 'help-action';
        action.textContent = shortcut.action;
        row.append(keysSpan, action);
        return row;
      }));
      dialog.append(heading, blurb, list);
    }

    const helpKey = keys.help ?? 'nothing — the help key is unbound';
    const footer = document.createElement('p');
    footer.className = 'help-footer';
    footer.textContent = `${helpKey} opens this. Escape or Enter closes it.`;
    dialog.append(footer);
    dialog.focus();

    dialog.addEventListener('keydown', (event) => {
      if (isModified(event)) return;
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      close();
    });
  });
}
