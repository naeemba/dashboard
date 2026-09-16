import { ACTIONS, defaultBinding, type ActionEntry, type ActionGroup } from './actions';
import { isSection } from './manager-sections';
import { type Mode } from './modes';
import { openOverlay } from './overlay';
import { PANE_SCROLLBACK } from './pane';
import type { Settings } from './settings';
import { isModified } from './shortcuts';

// One row of the help dialog: the keys you press, and what they do.
export type Shortcut = { keys: string; action: string };
// The blurb says what the screen is; the shortcuts say how to work it. A key list on its own teaches
// someone the gestures and not the thing they are gestures for.
export type Section = { title: string; blurb: string; shortcuts: Shortcut[] };

export const MODE_NAMES: Record<Mode, string> = {
  terminals: 'Terminals', nvim: 'nvim', board: 'Board', notes: 'Notes',
  manager: 'Manager', command: 'Command',
};

// What each screen and each group is, for the person who has not been told. The things worth knowing
// are the ones that are not visible: that a shell survives leaving the page, that nvim is not running
// yet, that the board has no save key, that settings are a file you can also edit by hand.
const BLURBS: Record<Mode | ActionGroup, string> = {
  terminals: 'Five shells in a grid. They keep running while you are on another project or '
    + 'another view, so a long job is still going when you come back. One of them at a time can be '
    + 'zoomed to fill the page and put back; while one is zoomed the pane holding the keyboard is '
    + 'the one you see, so moving between panes moves the zoom with you. One of them can be running an '
    + 'agent in a worktree instead of the project\'s own checkout — a card shipped into that pane — and '
    + 'the status bar names the branch of whichever pane you are in whenever it is sitting in a '
    + 'worktree, the agent\'s and the shell it leaves behind, so a command typed there does not land '
    + 'in the wrong place. When the pane is running a Claude Code agent the status bar also says what '
    + 'that agent has cost in tokens so far, read out of Claude Code\'s own logs on this machine — '
    + 'nothing is asked of any server. '
    + 'A pane says what is in it as well as its number. A program can name its own pane by setting the '
    + 'terminal title — every shell does it on each prompt, and an agent can be told to say what it is '
    + 'working on — and the name key names one yourself, which beats the title and lasts across a '
    + 'restart. Leave the box empty to go back to following the title. A title goes when the program '
    + 'that set it exits, so a pane waiting on Enter to restart is back to its number. A long name is '
    + 'cut to what the line has room for. The number stays in front of both, because the focus keys '
    + 'are numbered. '
    + 'A pane that rings the terminal bell to ask for you puts a pulsing red dot on its project along '
    + 'the top, turns that name '
    + 'yellow and says which pane on the right, and raises a system notification once if the window '
    + 'is behind something else. Clicking that notification brings the app forward on that pane. '
    + 'Going to the pane clears it. A bell is checked a second later against what the pane has on '
    + 'screen, so an agent that rings on its way past something and keeps working is left alone. '
    + 'The scrollback key takes you to the nvim screen with the pane you are looking at open there as a '
    + `file — the last ${PANE_SCROLLBACK} lines it printed, scrollback and screen alike, which is as far `
    + 'back as a pane remembers. The pane keeps running meanwhile, and the file is a copy: editing it '
    + 'changes nothing in the pane it came from.',
  nvim: 'One nvim filling the window. It starts the first time you press the nvim key for this '
    + 'project, not at launch. Quit it and the pane says it exited; Enter starts it again, and so does '
    + 'coming back to this screen — the scrollback key needs a running nvim to hand a file to. '
    + 'The status bar names the file nvim has open, and just says nvim while nothing is open. '
    + 'The scrollback key on the terminals screen sends the pane you are looking at here as a file in '
    + 'a new tab, so an agent transcript can be searched and yanked with real editor tools. It arrives '
    + 'whatever you were editing, unsaved changes and all, and it is a copy: editing it changes '
    + 'nothing in the pane it came from, and pressing the key again on that pane throws your edits away '
    + 'for a fresh copy. Each pane gets a tab of its own, so two of them can be read side by side.',
  board: 'A kanban board kept in .dashboard/board.json inside the project. Every change is written '
    + 'straight to disk, so there is no save key and undo is the only way back. The file is re-read '
    + 'each time you enter the board, and again while you are looking at it if something else writes '
    + 'it — an agent running the board command, or a hand edit — with your selection left on the card '
    + 'it was on and a box you have open left open on that card, still holding what you have typed. If '
    + 'the write took the card away, the box closes rather than moving your text onto its neighbour. A '
    + 'card you have open follows the write too: its subtasks redraw as they land, a subtask you are '
    + 'half-way through naming keeps what you have typed, and the card closes if the write took it '
    + 'away. A card can be a subtask of '
    + 'another card: it stays an ordinary card in whatever column you put it in, shows a badge naming '
    + 'its parent, and counts towards the bar on that parent. A card also carries the branch and pull '
    + 'request its work is on, which you type in, and the dates it was written and last changed, which '
    + 'the app keeps for you and shows when you open the card. '
    + 'A card also keeps a comment trail. The description is the one field you edit in place; '
    + 'everything said about the card as the work goes on is appended to the trail instead, so an '
    + 'agent recording what it found cannot take out what you wrote. The card says how many there '
    + 'are, opening it reads them oldest first, and c writes one — from the board or from the card. '
    + 'There is a Ship column, second from the left. Moving a card into it — rightward only — hands '
    + 'it to an agent: the app refuses if the project has anything uncommitted outside .dashboard/, '
    + 'fetches and branches off the project\'s base branch, makes a worktree in a folder beside the '
    + 'project, and starts an agent in a pane you have never typed into. Nothing you have written on '
    + 'this board is touched — the branch gets its own copy of the file. '
    + 'The card goes back to where it was once the ship works, carrying a line naming its branch and its '
    + 'pane — a column here says what has been merged, not what is in flight, and the work stays on '
    + 'its own branch until the pull request lands. A card already in flight cannot be shipped again; '
    + 'its badge says where the first one went. '
    + 'There is a Review column as well, the one just before Done — placed by the column it comes '
    + 'before rather than by a number, so a board with columns of your own still gets it. It is the one '
    + 'column the app moves a card into by itself — the one place a column here is not about what has '
    + 'merged. Once an agent has written a pull request number onto its card and gone quiet — the '
    + 'number alone is not enough, since it keeps working after it pushes that, and taking its folder '
    + 'away mid-run would take the work with it — the card lands in Review, the '
    + 'worktree the work was written in is thrown away, and a fresh one is cut from the same branch in '
    + 'the same folder with a pane that reviews the pull request, approves it and merges it. The badge '
    + 'reads reviewing while that runs, and the card reaches Done when the pull request is merged. '
    + 'A card already past Review is never reviewed again, however long its worktree is left lying '
    + 'around. '
    + 'Moving a card into Review yourself does nothing: it is where the app puts things, not a key. If '
    + 'the worktree could not be swapped — something was left uncommitted in it — the card still lands '
    + 'in Review and carries a comment saying why, since nothing was waiting on screen to be told. '
    + 'The mouse moves a card too: drag one to another column or to another row in its own column and '
    + 'it does what Shift with an arrow does, the drop into Ship included. A line along a card says '
    + 'where the one you are holding would land. A click on a card moves the selection onto it and '
    + 'opens its title, which is what Enter does there. '
    + 'The manager has one of these too, and it is every open project\'s board at once, one under the '
    + 'other. The same keys and the same writes — each project keeps its own undo — with two more that '
    + 'say which project the rest of them are aimed at, and Escape to go back to the manager\'s list. '
    + 'Every pane also carries DASHBOARD_BOARD, the path to a command that lists cards and moves them '
    + 'from a shell: run `node "$DASHBOARD_BOARD"` in a project to see what it takes. It is how an '
    + 'agent working a card moves its own, and .dashboard/CLAUDE.md in each project spells it out.',
  notes: 'One page of free text for this project, kept in .dashboard/notes.md beside the board, so it '
    + 'commits or is ignored with everything else the dashboard keeps about a project. It is for what '
    + 'is not a card: the command you can never remember, what the staging password is, where you had '
    + 'got to on Friday. '
    + 'There is no save key. What you type is written a moment after you stop typing, wherever you '
    + 'are by then — nothing runs when you leave, the wait simply finishes on its own. Arriving '
    + 'writes anything still waiting before it reads, so switching away and straight back shows what '
    + 'you just wrote rather than the page from before it. '
    + 'A write that did not land leaves the box holding a sentence the file never took, and arriving '
    + 'keeps it rather than reading the older page over it, however long ago that write went out. '
    + 'Arriving is also the only time the file is read. An edit made in a pane — or by an agent '
    + 'working in this project — shows up when you next come here; while you are sitting on this '
    + 'screen the box you are typing in is what gets written, and it wins. '
    + 'If that read fails the status bar says so, and nothing is written from then on: a box you '
    + 'were never shown the file in must not be saved over it. Type into it anyway and no later '
    + 'arrival reads either — reading now would take what you typed off the screen. The bar says so '
    + 'on every arrival, and it names the way back: copy the text out, then make the box match the '
    + 'file again — empty it where nothing was ever read, or undo back to the page that was there — '
    + 'and the next arrival reads. Either way the file is exactly as it was. '
    + 'It is a plain box and nothing more: nothing parses the markdown and nothing renders it. The '
    + 'name is there so the file is worth opening in an editor or reading on a forge. '
    + 'This screen has no keys of its own — everything that is not one of the keys below is a '
    + 'character in the box. Tab is the one thing it stops: the box is the whole screen, so Tab would '
    + 'take the keyboard somewhere you cannot see, and it does nothing here instead.',
  manager: 'The first tab, and the only page that is not a project: no folder and no shells, so the '
    + 'terminal, nvim and notes keys do nothing here. It is where the window lands when nothing was open last '
    + 'time. Three sections are named along the top — general, board, command — and the board key still '
    + 'comes straight here to the board. '
    + 'This one lists every open project and what its panes want from you — one asking a question, one that '
    + 'has died and needs starting again. Enter on a project shows all of its panes by name. The ones '
    + 'asking and the ones that have died carry the last few lines they printed, so the question or '
    + 'what it died of can be read from here; the rest carry the one line they last printed. Every '
    + 'pane says how long ago it printed, which is how you spot the one that has been quiet since '
    + 'this morning. Every project also carries three token figures at the end of its row: the last '
    + 'five hours, this week counting from Monday, and all time. A pane running a Claude Code agent '
    + 'carries what that agent has cost. They are read out of Claude Code\'s own logs on this machine '
    + 'and refresh every half minute. Enter on a pane takes you '
    + 'straight there; a letter, digit or symbol is sent to it instead, which answers a menu without '
    + 'leaving this page and takes the mark off the pane. The highlight stays on it, so a second '
    + 'question from the same pane is answered without picking it again. '
    + 'Only a pane that is asking takes a key that way: a pane that has died wants Enter in the '
    + 'pane itself, and one getting on with its work is left alone. A project with nothing to report '
    + 'says quiet beside its name, and still opens to show what its panes are up to. '
    + 'The close key works from here too, and this is the one screen where it needs a highlight: there '
    + 'is no project behind this page, so what it takes is the project the selection is on. What it '
    + 'takes and what stops it are the same everywhere, and the Projects section below says both.',
  command: 'One command, run in the projects you mark. Type it once — `npm audit`, `npm outdated`, '
    + 'the test suite — and choose how it runs. Enter gives every marked project a process of its own '
    + 'and puts the answers side by side: each row shows how its project exited and the last line it '
    + 'printed, Enter on a finished row shows the last few lines under it, and Escape stops the run. '
    + 'Nothing there touches the five shells, so whatever was in them is still there. '
    + 'The other key types the command into a shell instead — one free pane in each marked project, '
    + 'where it has history, prints as it goes and can be taken over mid-run. A free pane is one that '
    + 'has not died, has no agent mid-run on it, and is not still marked as asking for you. Two kinds '
    + 'of pane count as free that you might not mean. One running an ordinary long command — a dev '
    + 'server, a tail, psql, vim — and one whose agent asked you something that you have already '
    + 'looked at, because arriving at a pane takes its mark off. Both will take the line: telling a '
    + 'shell prompt from a program that is reading needs shell integration this app does not have. '
    + 'A project with no free pane is named in '
    + 'the status bar rather than quietly missed, and so is one whose folder has gone. Nothing comes '
    + 'back to this screen from a run like that — the output is in the pane, on that project\'s page. '
    + 'The last line is a guess and this screen does not pretend otherwise: a command whose final act '
    + 'is to redraw a progress bar shows that bar. Reading `npm audit` properly — three high, none '
    + 'moderate — would need a parser per tool, and every tool words it differently. '
    + 'The command you typed lasts while the app is running and is gone on restart, and so are the '
    + 'results: a run answers a question you are asking now, and is not a record of anything.',
  sections: 'The manager is three screens with one strip of names above them. These two keys walk it, '
    + 'from any of the three. The arrows are deliberately not these keys: on the board they move '
    + 'between cards.',
  modes: 'A project is shown four ways and remembers which one you left it on, so jumping to it '
    + 'lands you back in the same view. The manager has three of its own, named along the top: its '
    + 'list of what the panes want, every project\'s board, and one command run across projects.',
  projects: 'The first tab along the top is the manager; every tab after it is one project, in the '
    + 'order you put them in. A project cannot be moved in front of the manager, so the first two move '
    + 'keys both land it in tab 2. The next and previous keys walk the whole strip, so they pass '
    + 'through the manager on the way round. The window opens on the projects the last run was left '
    + 'on, and closing it asks first, because it kills every shell in every project. '
    + 'The close key takes one project away instead, the one whose page you are on: its page, its five '
    + 'shells and its editor go, whatever was in them, its tab goes with it and the next tab along '
    + 'takes its place, and the next launch opens without it. It refuses while a pane in that project '
    + 'has an agent working or a question waiting, and names the panes in the way. What it cannot see '
    + 'is a pane running an ordinary long command — a dev server, a tail, vim — which reads as idle '
    + 'exactly as it does on the command screen, so a close it allows is not a promise that nothing '
    + 'was running — which is why it asks first, and Enter is what takes the project away.',
  app: 'Every key on this list can be changed, and so can the colours, the font and the shell. They '
    + 'are kept in ~/.config/dashboard/settings.json, which you can also edit by hand. It holds only '
    + 'what you changed; anything you left alone follows the app\'s default, including when that '
    + 'default moves. The app tidies the file each time it starts, so a line you write that already '
    + 'matches the default is taken out again. '
    + 'Delete it and everything is back to how it shipped. '
    + 'The worktree list — its key is on this page — holds every card that has been shipped, its '
    + 'branch, how old the worktree is, whether it has uncommitted changes, and which pane its agent '
    + 'is in — no pane if every pane was already taken when it shipped, or if the app has restarted '
    + 'since, because no shell outlives it. Enter on a row goes to that pane; a row with no pane, and '
    + 'one whose project has been closed since it shipped, say so rather than doing nothing. '
    + 'A row leaves the list on its own only when its worktree has gone — removed in a pane, or deleted by hand; nothing is ever removed for you. d removes one, asking twice — the '
    + 'second question names the files if the worktree is dirty, and says why git refused if it '
    + 'refused for some other reason. The folder and everything in it goes, gitignored files '
    + 'included, and the pane its agent was in goes back to being a plain shell in the project. The '
    + 'branch is left behind on purpose — the pull request it came from may still be open.',
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
// are on and nvim and notes are screens with no group: no action has either, so the list comes back
// empty and their keys are printed from UNBOUND_SHORTCUTS instead.
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

// The group named after the screen, then whatever that screen takes without a binding. nvim and notes
// have no group at all, so their lists are only the second half.
// The manager's three screens get one more, and only there: `onManagerPage` is the same question
// `hears` asks before firing a manager-page action, asked here so the dialog never lists a key that
// question would refuse. A project's own board is `isSection(mode)` too, and must not get these rows.
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
  const rest: readonly ('modes' | 'projects' | 'app')[] = ['modes', 'projects', 'app'];
  return [screen, ...rest.map((group) => ({
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
