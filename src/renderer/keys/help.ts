import { type ActionGroup } from '../../shared/keys/actions';
import { LOG_FILE_COUNT, LOG_FILE_LIMIT_SHOWN } from '../../shared/app/log-entry';
import { labelled } from '../app/icons';
import { keycaps } from './keycaps';
import { isSection } from '../../shared/manager/manager-sections';
import { type Mode } from '../../shared/keys/modes';
import { openOverlay } from '../app/overlay';
import type { Settings } from '../../shared/settings/settings';
import { shortcutRows, type Shortcut } from './shortcut-rows';
import { isModified } from './shortcuts';

// The blurb says what the screen is; the shortcuts say how to work it. A key list on its own teaches
// someone the gestures and not the thing they are gestures for.
export type Section = { title: string; blurb: string; shortcuts: Shortcut[] };

export const MODE_NAMES: Record<Mode, string> = {
  terminals: 'Terminals', nvim: 'nvim', board: 'Board', notes: 'Notes',
  manager: 'Manager', command: 'Command', log: 'Log',
};

// What each screen and each group is, for the person who has not been told: the things that are not
// visible, such as a shell surviving the page, nvim not running yet, the board having no save key.
// Each stays under BLURB_WORD_LIMIT so the keys start on the dialog's first screen; the full account
// of a screen lives in its feature's docs/<feature>/README.md, under "On screen".
export const BLURB_WORD_LIMIT = 60;

export const BLURBS: Record<Mode | ActionGroup, string> = {
  terminals: 'Main, the project\'s Claude Code session, on the left, dispatching your tasks into the '
    + 'worker panes down the right. A yellow edge: a worker waits on you; green: its turn is over. '
    + 'Panes keep running on other pages and through a restart. Ctrl+C is the shell\'s interrupt, so '
    + 'off a mac copy and paste have keys of their own.',
  nvim: 'One nvim filling the window, started the first time you press the nvim key here, not at '
    + 'launch. Quit it and Enter starts it again. The scrollback key on the terminals screen sends a '
    + 'pane here as a file in a tab of its own: a copy, so editing it changes nothing in the pane.',
  board: 'A kanban board in .dashboard/board.json, written on every change: no save key, undo is '
    + 'the way back. Another writer\'s change shows while you look. A card moved into Ship goes to an '
    + 'agent in its own worktree; the app puts it in Review once a pull request is open.',
  notes: 'One page of free text in .dashboard/notes.md: the project\'s, or for the manager a folder '
    + 'in your home directory. For what is not a card. No save key: it is written a moment after you '
    + 'stop typing, and read only when you arrive, so an edit made elsewhere shows next time. Plain '
    + 'text; Tab does nothing here.',
  manager: 'The first tab, and no project: no shells, so the terminal and nvim keys do nothing here. '
    + 'Needs you lists what waits on you across the open projects, oldest first; under it, every '
    + 'project with its panes, token figures and worktrees. A letter, digit or symbol answers the '
    + 'selected waiting pane without leaving the page.',
  command: 'One command, run in the projects you mark. Enter gives each its own process and shows '
    + 'how it exited and the last line it printed; the other key types it into a free shell in each '
    + 'instead, where it prints as it goes. The last line is a guess, and the command and its results '
    + 'are gone on restart.',
  claude: 'A Claude Code conversation drawn as a page: tables, highlighted code, diffs, and tool calls '
    + 'folded to a line the unfold key opens. It runs as the project\'s main session with the '
    + 'project\'s own CLAUDE.md, skills and MCP servers. Enter sends, Shift+Enter starts a line, a '
    + 'slash lists commands, @ mentions a file, and the interrupt key stops Claude.',
  sections: 'The manager is five screens under one strip of names; two of these keys walk it from any '
    + 'of them, since the arrows belong to the board and the notes. The refresh key reads the four '
    + 'cards above the strip now rather than at the next half hour.',
  modes: 'A project is shown five ways and remembers the one you left it on. The five are named along '
    + 'the foot of its page, and a click on a name goes there. On the manager the board and notes '
    + 'keys land on its own board and notes sections.',
  projects: 'The first tab is the manager; every tab after it is a project, in your order. Worker '
    + 'shells run in a pane host outside the app, so a quit or a crash leaves them running. The close '
    + 'key takes a project away, refused while a worker runs something. The drawer lists the '
    + 'project\'s docs and its Claude conversations.',
  log: 'What the app did and what went wrong, newest first. Type to filter: every word must appear, '
    + 'so `error ship` is the ships that failed. Kept in dashboard.log in the app\'s data folder, '
    + LOG_FILE_COUNT + ' files of ' + LOG_FILE_LIMIT_SHOWN + '. Never what you type in a pane.',
  app: 'Hold Ctrl, Cmd or Alt alone and a panel names every key that modifier can still start here. '
    + 'Every key, colour, font and the shell can be changed; they live in '
    + '~/.config/dashboard/settings.json, which holds only what you changed. The Host rows let another '
    + 'Dashboard connect to this one. The worktree list holds every shipped card\'s worktree.',
};

// What a screen does with the keys no binding names, which is why these are written out rather than
// printed from the action table. nvim owns everything the dashboard did not claim, and on the manager
// a typed character is the answer the selected pane is waiting for, every named key there being bound
// already. Both are the answer to "what can I press here", so both are printed under the keys that do
// have names.
export const UNBOUND_SHORTCUTS: Partial<Record<Mode, Shortcut[]>> = {
  nvim: [{ keys: 'Everything else', action: 'Goes straight to nvim' }],
  notes: [{ keys: 'Everything else', action: 'Goes into the notes' }],
  manager: [{ keys: 'A letter, digit or symbol', action: 'Straight to the selected waiting pane' }],
  command: [{ keys: 'Space', action: 'Mark or unmark the project under the selection' }],
};

// One group of the action table, each row spelling the whole binding. An action with no key gets no
// row: this dialog answers "what can I press here", and you cannot press an unbound action. The
// settings screen is where every action is listed whether it has a key or not.
// `group` takes a Mode as well, because screenShortcuts asks for the group named after the screen you
// are on and nvim and notes are screens with no group: no action has either, so the list comes back
// empty and their keys are printed from UNBOUND_SHORTCUTS instead.
function groupShortcuts(
  group: ActionGroup | Mode, mode: Mode, keys: Settings['keys'], isMac: boolean,
): Shortcut[] {
  return shortcutRows({
    wants: (entry) => entry.group === group,
    label: (entry) => keys[entry.name] ?? null,
    mode,
    keys,
    isMac,
  });
}

// The group named after the screen, then whatever that screen takes without a binding. nvim and notes
// have no group at all, so their lists are only the second half.
// The manager's five screens get one more, and only there: `onManagerPage` is the same question
// `hears` asks before firing a manager-page action, asked here so the dialog never lists a key that
// question would refuse. A project's own board and its own notes are `isSection(mode)` too, and must
// not get these rows.
function screenShortcuts(
  mode: Mode, onManagerPage: boolean, keys: Settings['keys'], isMac: boolean,
): Shortcut[] {
  return [
    ...groupShortcuts(mode, mode, keys, isMac),
    ...(onManagerPage && isSection(mode) ? groupShortcuts('sections', mode, keys, isMac) : []),
    ...UNBOUND_SHORTCUTS[mode] ?? [],
  ];
}

// The screen you are on comes first: it is what you pressed the help key to ask about. The keys that
// answer from everywhere follow, since they are the ones you already half know.
export function helpSections(
  mode: Mode, onManagerPage: boolean, keys: Settings['keys'], isMac: boolean,
): Section[] {
  const screen: Section = {
    title: MODE_NAMES[mode],
    blurb: BLURBS[mode],
    shortcuts: screenShortcuts(mode, onManagerPage, keys, isMac),
  };
  // Main on a terminals view, a project's or the manager's, is the Claude screen, whose keys answer
  // while it has the keyboard.
  const main: Section[] = mode === 'terminals'
    ? [{ title: 'Claude', blurb: BLURBS.claude, shortcuts: groupShortcuts('claude', mode, keys, isMac) }]
    : [];
  const rest: readonly ('modes' | 'projects' | 'app')[] = ['modes', 'projects', 'app'];
  return [screen, ...main, ...rest.map((group) => ({
    title: { modes: 'Modes', projects: 'Projects', app: 'Dashboard' }[group],
    blurb: BLURBS[group],
    shortcuts: groupShortcuts(group, mode, keys, isMac),
  }))];
}

// Read-only, so there is nothing to walk over: Escape or Enter closes it and the arrows scroll a list
// too long for the dialog.
export function openHelp(
  mode: Mode, onManagerPage: boolean, keys: Settings['keys'], isMac: boolean,
): Promise<void> {
  return new Promise<void>((resolve) => {
    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('help', close);
    dialog.append(labelled('h2', 'dialog-title', 'keyboard', 'Keyboard shortcuts'));

    for (const section of helpSections(mode, onManagerPage, keys, isMac)) {
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
        keysSpan.append(keycaps(shortcut.keys));
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
