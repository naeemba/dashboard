import '@xterm/xterm/css/xterm.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import './worktrees.css';
import { openHelp } from './help';
import { mapShortcut, type Action } from './shortcuts';
import { type Mode } from './modes';
import { openPicker } from './picker';
import { openWorktrees, redrawWorktrees } from './worktree-view';
import { TITLE_BAR_HEIGHT } from './theme';
import {
  EDITOR_INDEX, TERMINAL_COUNT, modeOfPane, neighbor, paneFromId, paneLabel, paneName, startsEditor, terminalId,
} from './terminals';
import { terminalStatus, type StatusPage } from './status';
import type { Project } from './projects';
import type { Session } from './session';
import type { WorktreeEntry } from './worktree-store';
import type { WorktreeList } from './bridge';
import { defaultSettings, type Settings } from './settings';
import { openSettings } from './settings-view';
import { OVERLAY_SELECTOR, confirmOverlay, promptOverlay } from './overlay';
import { anyWaiting, waitingNames } from './waiting';
import {
  MANAGER_PROJECT, MANAGER_SLOT, isProjectPage, landingPosition, managerRows, positionAfterClose,
  projectPosition,
} from './manager';
import { createManagerView } from './manager-view';
import { createCardsView } from './cards-view';
import { createCommandView } from './command-view';
import { closeRefusal } from './close-project';
import { planSend, type SendPlan } from './free-pane';
import { paneLastLine, paneScrollback, paneTail, paneUse, type Pane } from './pane';
import { createPageBuilder, discardPanes, fitPanes, panesById, restylePanes, type Page } from './page';
import { createSectionStrip } from './section-strip';
import { nextSectionMode } from './manager-sections';
import { actionByName } from './actions';

// Pane and terminal building left here for page.ts when this file reached the 600-line ceiling, which
// is the seam it had named for itself. What is left is plumbing: which page is in front, what the
// status bar says, what the session file holds, and where a key goes. The next feature that needs room
// splits again, and the seam then is the group at the bottom that answers for panes somewhere else —
// goToPane, jumpToWorktree, sendToPanes and answerPane.

const bridge = window.dashboard;
const isMac = bridge.platform === 'darwin';
// Replaced by the real file in start(), before any pane is built. Held here rather than passed down
// because a settings change has to reach every pane on every page at once.
let settings: Settings = defaultSettings(isMac);
// What a dropped path is quoted for. Main decides it — pickShell weighs the settings file, SHELL_COMMAND,
// SHELL and the platform — and hands the answer back here at launch and again on every save, so this
// file never holds a second copy of that precedence to get out of step with.
let shellCommand = '';

document.documentElement.style.setProperty('--title-bar-height', `${TITLE_BAR_HEIGHT}px`);

// Every colour as a CSS custom property, which index.css styles the chrome from. Published for the
// shipped theme immediately, at module load, before start() has awaited anything — a status bar
// reporting a failed start needs its colours already on the document, since nothing later is
// guaranteed to run.
function publishTheme(theme: Settings['theme']): void {
  for (const [name, value] of Object.entries(theme)) {
    document.documentElement.style.setProperty(`--${name}`, value);
  }
}
publishTheme(settings.theme);

// Only macOS overlays traffic lights on the title row, so only there does the title indent for them.
document.documentElement.classList.toggle('mac', isMac);
const statusElement = document.getElementById('status') as HTMLElement;
// Projects on the left, the focused pane pushed to the right, so the two are never read as one list.
const statusProjects = document.createElement('span');
statusProjects.className = 'projects';
const statusTerminal = document.createElement('span');
statusTerminal.className = 'terminal';
// Its own span, between the two, because renderStatus() rebuilds the tab strip on every keystroke.
// A message written into that span is gone by the next arrow key, which is how the salvage notice
// used to disappear before anyone could read it.
const statusError = document.createElement('span');
statusError.className = 'error';
statusElement.append(statusProjects, statusError, statusTerminal);

// Whoever wrote the message on screen owns it, and only that owner may clear it. Without the owner a
// clean read anywhere clears everything: open a read-only project, get `Board not saved: EACCES`, then
// look at another project's board and the message is gone while the card still is not on disk.
let errorOwner = '';
function showError(owner: string, message: string): void {
  if (message === '' && errorOwner !== owner) return;
  errorOwner = message === '' ? '' : owner;
  statusError.textContent = message;
}
const titleElement = document.getElementById('title') as HTMLElement;
const pagesElement = document.getElementById('pages') as HTMLElement;
const pages: Page[] = [];
let activeIndex = 0;
// Where Ctrl+O goes back to. Held as a slot, the one thing about a page that never changes:
// Ctrl+Shift+digit moves its position, and reopening a project rebuilds the page object itself.
let previousSlot: number | null = null;

function projectPages(): Page[] {
  return pages.filter(isProjectPage);
}

// Every worktree in flight, held here rather than on a board view: a card shipped from the manager's
// stack of boards lands in a project whose own board may never have been opened, and its pane would
// then sit in a worktree with the status bar calling it "terminal 2".
let worktrees: WorktreeEntry[] = [];
// The folder each pane's shell was started in, keyed by terminal id, which is what says whether a pane
// is in a worktree. Main's copy, never a second one kept here, and it rides along with the records
// because only main knows where a pane is. When a message carries it is setWorktrees' to say — see
// main.ts, where that is decided.
let paneDirectories: Record<string, string> = {};
function applyWorktrees(list: WorktreeList): void {
  worktrees = list.entries;
  paneDirectories = list.paneDirectories;
  renderStatus();
  // The badges too, not only the status bar: a card whose worktree has gone would otherwise still read
  // `shipped · <branch> · terminal 3` until you left the board and came back. The page in front is the
  // only one that needs it — arriving at any other re-opens its board, and on the manager this one call
  // is every project's board at once, since the stack of them is that page's board.
  pages[activeIndex].board?.redraw();
  // And the worktree dialog, if it is the thing on screen: it lists the records themselves, so a row
  // whose folder has gone has to leave the list under you rather than wait to be pressed.
  redrawWorktrees();
}

// Everything status.ts needs to say what the right-hand span says about this page, read off the module
// state it cannot reach on its own.
function statusPage(page: Page): StatusPage {
  return {
    mode: page.mode,
    focused: page.focused,
    paneCount: page.panes.length,
    boardLabel: page.board?.statusLabel() ?? '',
    hasProjects: projectPages().length > 0,
    managerStatusLabel: page.manager?.statusLabel() ?? '',
    commandStatusLabel: page.command?.statusLabel() ?? '',
    pickerBinding: settings.keys['project-picker'] ?? 'Nothing',
    pickerDescription: actionByName('project-picker')?.description ?? '',
    worktrees,
    focusedDirectory: paneDirectories[terminalId(page.slot, page.focused)] ?? '',
    focusedName: paneName(page.panes[page.focused] ?? {}),
    editorName: paneName(page.editor ?? {}),
  };
}

// The grid's five and the editor, which rings its bell like any other pane.
function allPanes(page: Page): Pane[] {
  return page.editor === null ? page.panes : [...page.panes, page.editor];
}

// The same panes with what each is called right now. A pane's name moves — a program sets a title, you
// type one — so it is worked out at the moment something asks rather than kept on the pane, and this is
// the one place the asking happens: the manager's rows, the tab strip's waiting marks, the status bar's
// list and the sentence that refuses to close a project all read it from here.
//
// No branch, which is the one thing the status bar adds for itself: it names a single pane and has the
// room, where these are lists of six.
function namedPanes(page: Page): (Pane & { name: string })[] {
  return allPanes(page).map((pane, index) => ({ ...pane, name: paneLabel(index, undefined, paneName(pane)) }));
}

// The manager page is pushed before the first call, so there is always a page to draw.
// `panesOnly` is the timer's redraw below, which has nothing to change on a row but the line its pane
// last printed and how long ago that was. Everything else here runs either way, so the status bar
// still reads the age off the selection and the tab strip is still the one this function has always
// drawn.
function renderStatus(panesOnly = false): void {
  const page = pages[activeIndex];
  // Before the status bar reads its label off the selection. The rows are the pages themselves, so a
  // bell, an exit or a project opening all reach the manager through the redraw they already cause —
  // and only while you are looking at it, since arriving redraws too and typing a card title on a
  // board should not rebuild a list nobody can see.
  if (page.mode === 'manager') {
    const rows = managerRows(projectPages().map((entry) => ({
      project: entry.project,
      slot: entry.slot,
      panes: namedPanes(entry).map((pane) => ({
        ...pane,
        tail: () => paneTail(pane.terminal),
        lastPrinted: () => paneLastLine(pane.terminal),
      })),
    })));
    if (panesOnly) page.manager?.refreshPanes(rows);
    else page.manager?.render(rows);
  }
  titleElement.textContent = `📁 ${page.project.name}`;
  // A span each: the open project is marked by a highlight, the way a tab strip marks one, and a
  // project with a pane ringing its bell is marked again so you can see it from another page.
  statusProjects.replaceChildren(...pages.map((entry, index) => {
    const tab = document.createElement('span');
    tab.className = 'project';
    tab.classList.toggle('active', index === activeIndex);
    tab.classList.toggle('waiting', anyWaiting(allPanes(entry)));
    tab.textContent = entry.project.name;
    return tab;
  }));
  statusTerminal.textContent = terminalStatus(statusPage(page), waitingNames(namedPanes(page)));
  saveSession();
}

// Hung off renderStatus because the two answer the same question: everything that changes which project
// is in front, which view it shows, or which pane has the keyboard already redraws the status bar.
// True until restore() has put every project back, so the partial layouts it passes through on the
// way are never the one on disk.
let restoring = true;
let lastSaved = '';
function saveSession(): void {
  // A restore opens the projects one at a time, and each one redraws. Saving those would leave the file
  // holding two of your five projects for the whole of startup, so an app killed while it was still
  // opening them would come back next time with the three missing for good.
  if (restoring) return;
  // A project whose folder went away is not written back. It stays on screen for this run — nothing
  // closes a page — but the next launch starts without it, instead of reopening the same dead tab and
  // saving it again forever. The project list already works this way: a missing project is neither
  // offered by Ctrl+S nor remembered as a recent.
  // The manager goes with it: it has no folder to name, and a page with no path is one parseSession
  // throws away on the way back in, which would shift activeIndex past the project it points at.
  const live = projectPages().filter((page) => !page.project.missing);
  const session: Session = {
    // Counted in the filtered list: a dead page sitting before the active one would otherwise shift it,
    // and the active page may itself be the dead one, which lands on the first survivor.
    activeIndex: Math.max(0, live.indexOf(pages[activeIndex])),
    pages: live.map((page) => ({
      path: page.project.path,
      mode: page.mode,
      focused: page.focused,
      // The grid's five, which is every pane a name can be typed into; see namePane.
      names: page.panes.map((pane) => pane.typedName ?? null),
    })),
  };
  // Typing a card title redraws the status bar on every keystroke and changes nothing here.
  const encoded = JSON.stringify(session);
  if (encoded === lastSaved) return;
  lastSaved = encoded;
  bridge.saveSession(session);
}

// Every colour goes out twice: as a CSS custom property, which index.css styles the chrome from, and
// into every pane's own palette. Both have to move together or the board sits on one background while
// the shell beside it sits on another.
//
// The window's own background is not here. Main paints it before the renderer exists, so it keeps the
// old colour until the next launch — visible only in the margin around the panes.
function applyAppearance(): void {
  publishTheme(settings.theme);
  restylePanes(settings);
  // The cell size changes with the font, so every pane has to be measured again or the grid keeps the
  // old one and the last row is cut off.
  fitAllPages();
}

function focusTerminal(index: number): void {
  const page = pages[activeIndex];
  if (page.panes.length > 0) {
    page.focused = (index + TERMINAL_COUNT) % TERMINAL_COUNT;
    page.panes[page.focused].terminal.focus();
  }
  renderStatus();
}

// Zooming is one class on the view; which pane it lands on is the CSS's to answer from what has the
// keyboard. Nothing is remembered across a restart — the panes come back as the grid they are.
// The fit is unconditional here, unlike the one in `buildPane`'s focus handler: on the way out of
// zoom the class is already gone, and the pane that shrank still has to be told.
function toggleZoom(page: Page): void {
  // The CSS grows whichever pane holds the keyboard, so the key has to make sure one does. A click on
  // the status bar or on a pane's border leaves the keyboard on the body, and the class would then have
  // nothing to grow and the key would look broken. The class moves first so that the fit the focus
  // handler runs is already measuring the size the pane is going to keep. The other half is left alone
  // on purpose: such a click still drops the zoom off the screen until you press something, because the
  // zoomed pane is read from focus rather than remembered.
  page.views.terminals?.classList.toggle('zoom');
  page.panes[page.focused]?.terminal.focus();
  fitPanes(page);
}

// Switching mode is per page, so each project keeps the view you left it on. A dead project has no
// views to switch between and ignores the keys.
// The mode and which view is on screen are one fact, so they only ever move together. Restoring a page
// sets them without arriving at it, which is why this is not simply the top of setMode.
function showMode(page: Page, mode: Mode): void {
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) if (view) view.hidden = name !== mode;
  page.strip?.render(mode);
}

function setMode(mode: Mode): void {
  const page = pages[activeIndex];
  // A page only switches to a view it has. A dead project has none, and the manager has only its own,
  // so on both the mode keys do nothing rather than leaving the status bar naming a view that is not
  // on screen.
  if (!page.views[mode]) return;
  showMode(page, mode);
  focusMode(page, true);
}

// nvim, running by the time this returns — started if it has never run, started again if it was quit.
// The question and the answer together on purpose: with the condition left to the callers, the second
// one wrote its own and got a different one, and the third would have copied whichever it read first.
// What that looks like: quit nvim, press the scrollback key, and it waits fifteen seconds for a socket
// nothing is going to create before telling you nvim did not start.
function startEditor(page: Page): void {
  if (!page.editor) return;
  if (!startsEditor({ started: page.editorStarted, exited: page.editor.exited })) return;
  page.editorStarted = true;
  page.editor.exited = false;
  // The same reset the Enter path in page.ts does. Without it the `[exited 0] press Enter to restart`
  // line stays in the pane's scrollback and reappears the next time nvim drops the alt screen.
  page.editor.terminal.reset();
  bridge.restart(terminalId(page.slot, EDITOR_INDEX));
  bridge.resize(terminalId(page.slot, EDITOR_INDEX), page.editor.terminal.cols, page.editor.terminal.rows);
}

// `entering` is true for a genuine arrival at the page's current mode — switching modes, or switching to
// a different page — and false for merely reclaiming the keyboard, such as the picker closing on the
// page you never left. Only a genuine arrival may start nvim or re-read the board: re-opening the board
// on every refocus would throw away its undo step each time, since board.open() resets it.
function focusMode(page: Page, entering: boolean): void {
  if (page.mode === 'manager') page.views.manager?.focus();
  if (page.mode === 'command' && page.command) {
    // Re-read on arrival, the way the board is: a project opened since you were last here needs a row.
    if (entering) page.command.render();
    page.command.focus();
  }
  if (page.mode === 'terminals') return focusTerminal(page.focused);
  if (page.mode === 'nvim' && page.editor) {
    // Started the first time you ask for it, through the same path a dead pane restarts by. Quit
    // nvim and the pane says so and waits for Enter, exactly like a shell that has exited.
    if (entering) startEditor(page);
    page.editor.terminal.focus();
  }
  if (page.mode === 'board' && page.board) {
    // open() never rejects — a failed read reports itself through onError and still renders — so no
    // report() wrapper is needed here.
    if (entering) void page.board.open();
    else page.board.element.focus();
  }
  renderStatus();
}

function positionOfSlot(slot: number | null): number {
  return pages.findIndex((page) => page.slot === slot);
}

// Hidden pages keep their layout (visibility, not display), so every pane can be fit.
function fitAllPages(): void {
  for (const page of pages) {
    fitPanes(page);
    page.editor?.fit.fit();
  }
}

// `arriving` forces the landing to count as a genuine arrival even when the page is already the active
// one. Two callers pass it. The restore needs it: it lands on a page nobody has visited yet this run,
// so nvim has to start and the board has to be read, exactly as if you had just switched to it. A
// notification click passes it as insurance — the pane had to be running to ring, so nothing it would
// start is not started already — and keeps the two landings on one path rather than two.
function showPage(index: number, arriving = false): void {
  const next = (index + pages.length) % pages.length;
  // Landing back on the page you are already on — Escape closing the picker, a folder dialog cancelled —
  // only needs its keyboard focus back, not a fresh arrival at its mode.
  if (next === activeIndex) return focusMode(pages[activeIndex], arriving);
  previousSlot = pages[activeIndex].slot;
  landOn(next);
}

// Put this page on screen and every other one away, then give it the keyboard. Split out of showPage
// for the one caller that cannot go through it: a close takes the page you are standing on out of the
// list, so there is no page to come from and no previous tab to remember — the tab that took its place
// simply has to appear.
function landOn(index: number): void {
  activeIndex = index;
  pages.forEach((page, pageIndex) => {
    page.element.hidden = pageIndex !== activeIndex;
  });
  focusMode(pages[activeIndex], true);
}

// The one page with no folder behind it, so none of what buildPage makes: no shells and no editor. It
// has two views — the list of what every project's panes want, and every project's board — and the
// mode keys for the two it does not have do nothing here.
// Its board is a board like any other as far as this file is concerned: same field, same mode, same
// four functions. What is behind it is one real board per open project rather than one for a folder.
function buildManagerPage(): Page {
  const element = document.createElement('section');
  // The modifier is what index.css uses to push this page's views down below the section strip —
  // a project's page has no strip, so it keeps the plain .page rule and needs none of that.
  element.className = 'page page-manager';
  const manager = createManagerView({
    onJump: goToPane, onAnswer: answerPane, onClose: closeProject, onChanged: renderStatus,
  });
  const cards = createCardsView({
    bridge,
    // Read on every arrival rather than handed over once, so a project opened since you were last here
    // has a board.
    projects: projectPages,
    onChanged: renderStatus,
    // A slot each, and a different owner from the same project's own board, so the two screens reading
    // one file never clear each other's message.
    onError: (slot, message) => showError(`cards:${slot}`, message),
    worktrees: () => worktrees,
  });
  const command = createCommandView({
    projects: () => projectPages().map((entry) => ({
      name: entry.project.name, path: entry.project.path,
    })),
    runTask: (text, paths) => bridge.runTask(text, paths),
    runInPanes: (text, paths) => sendToPanes(text, paths),
    cancelTasks: () => bridge.cancelTasks(),
    binding: (actionName) => settings.keys[actionName] ?? 'Nothing',
    onChanged: renderStatus,
  });
  // Above the three views rather than inside one, so it is on screen whichever section is showing.
  const strip = createSectionStrip((mode) => setMode(mode));
  element.append(strip.element, manager.element, cards.element, command.element);
  const page: Page = {
    project: MANAGER_PROJECT, element,
    views: { manager: manager.element, board: cards.element, command: command.element },
    mode: 'manager', panes: [], focused: 0, slot: MANAGER_SLOT, editor: null, editorStarted: false,
    board: cards, manager, command, strip,
  };
  // Which view is on screen and which mode the page is in are one fact, and showMode is where they are
  // set together — including here, where the page has not been arrived at yet.
  showMode(page, 'manager');
  return page;
}

// The one page builder, handed the few things a pane needs from this file. Every one that can change
// while the app runs is a function rather than a value — the settings and the shell do — so a pane built
// an hour ago draws what is in force now. The bridge is the exception: it is the same object for the
// life of the window.
const buildPage = createPageBuilder({
  bridge,
  settings: () => settings,
  shellCommand: () => shellCommand,
  onChanged: () => renderStatus(),
  onError: showError,
  managerInFront: () => pages[activeIndex].mode === 'manager',
  worktrees: () => worktrees,
});

// Builds the page for a slot, replacing whatever is there — a missing project's dead page becomes a
// live one once the folder exists. A replacement keeps the old page's position in the list.
function setPage(project: Project, slot: number): void {
  const page = buildPage(project, slot);
  const existing = positionOfSlot(slot);
  if (existing === -1) {
    pagesElement.append(page.element);
    pages.push(page);
    return;
  }
  pages[existing].element.replaceWith(page.element);
  pages[existing] = page;
}

// Asked twice — once before the question and once with the answer — so it is one function. What the
// flags catch and what the sentence says are close-project.ts's; this only reads them off live panes.
function closeRefusalFor(page: Page): string {
  return closeRefusal(
    page.project.name,
    namedPanes(page).map((pane) => ({ name: pane.name, ...paneUse(pane) })),
  );
}

// Closing a project: the one you are on, or the one the manager's list is pointing at. Everything it
// takes is gone for good — five shells, the editor, and whatever was running in them — so what can stop
// it, and the sentence saying so, are close-project.ts's. A pane that has exited or is sitting at a
// prompt stops nothing, so the question below is asked whether or not anything was in the way.
// The slot is not given to anyone else afterwards: main hands out a new one per project opened, so a
// pane id that named this project names nothing from here on.
function closeProject(slot: number): void {
  const position = positionOfSlot(slot);
  const page = pages[position];
  // The manager holds a slot of its own and has no folder to close; a slot with no page is one that
  // has already gone.
  if (!page || !isProjectPage(page)) return;
  const refusal = closeRefusalFor(page);
  if (refusal !== '') return showError('close', refusal);
  // Nothing is in the way, so an earlier refusal is already false whatever the answer to the question
  // is: cancelling the dialog leaves no path back here to clear it.
  showError('close', '');
  // Asked even when nothing is in the way, because that is exactly when the loss is invisible: a pane
  // editing an unsaved file in vim rings no bell and prints nothing, so the refusal above sees a quiet
  // project and lets it go. Deleting one card asks, and removing a worktree git can recreate asks
  // twice; this takes five shells and an editor with no undo.
  void confirmOverlay(
    `Close ${page.project.name}?`,
    'Enter closes it, its five shells and its editor. Escape keeps it.',
  ).then((confirmed) => {
    // The keyboard back to the page first, for the same reason namePane does it: the sheet that held the
    // focus has gone, so answering Escape here would otherwise leave you unable to type in any pane.
    showPage(activeIndex);
    if (!confirmed) return;
    // Read again rather than reused: the dialog is open for as long as it takes to answer, and the page
    // may have gone in that time — a folder deleted, a close from elsewhere — so what leaves the list is
    // found afresh here.
    const closingPosition = positionOfSlot(slot);
    if (closingPosition === -1) return;
    // Whatever page holds this slot is a project page, because the slot is the same one the check at
    // the top answered for and isProjectPage reads nothing else.
    const closingPage = pages[closingPosition];
    // Read again with the page and for the same reason: the answer was given over a quiet project, and
    // a pane that took an agent or a question while the dialog was up is one the close refuses over.
    const late = closeRefusalFor(closingPage);
    if (late !== '') return showError('close', late);
    bridge.closeProject(slot);
    discardPanes(slot);
    closingPage.element.remove();
    pages.splice(closingPosition, 1);
    // The page that went can be the one you were standing on, since the key closes the project you are
    // looking at. Land on whatever took its tab — the project to its right, or the tab to its left when
    // it was the last one, which is the manager at worst. A close from the manager's own list is the
    // other case and needs none of this: the manager holds the first tab and never moves off it, so
    // what leaves is always behind the page you are looking at.
    if (closingPosition === activeIndex) landOn(positionAfterClose(closingPosition, pages.length));
    // The row leaves the list, the tab leaves the strip, and the session file is written without it.
    renderStatus();
  });
}

// Moves the project on screen to a position, the way you would drag a tab. Slots and shells are
// untouched; only the order you cycle and jump through changes. Where it may land, and whether the page
// you are on may move at all, are manager.ts's to answer.
function moveProject(index: number): void {
  if (index >= pages.length || !isProjectPage(pages[activeIndex])) return;
  const target = projectPosition(index);
  pages.splice(target, 0, ...pages.splice(activeIndex, 1));
  activeIndex = target;
  renderStatus();
}

// Main owns the decision and reports it as `replaced`, so a page is only rebuilt when its shells were.
// A null path asks main for the folder dialog.
async function openProject(projectPath: string | null): Promise<void> {
  const opened = await bridge.openProject(projectPath);
  if (!opened) return showPage(activeIndex);
  if (opened.replaced) {
    setPage(opened.project, opened.index);
    fitAllPages();
  }
  const position = positionOfSlot(opened.index);
  if (position !== -1) showPage(position);
}

// Projects already open come first and win the deduplication, so the picker shows the live page for one
// that is also in the history.
async function showPicker(): Promise<void> {
  const recent = await bridge.getRecentProjects();
  const byPath = new Map<string, Project>();
  for (const page of projectPages()) {
    if (!page.project.missing) byPath.set(page.project.path, page.project);
  }
  for (const project of recent) if (!byPath.has(project.path)) byPath.set(project.path, project);
  const choice = await openPicker([...byPath.values()]);
  if (choice === undefined) return showPage(activeIndex);
  await openProject(choice);
}

// Ctrl+`: the pane you are looking at, as a file in the project's nvim.
//
// Main is asked before the mode is switched, and the order matters on a cold editor: the switch is what
// starts nvim, and main is already waiting on the socket by the time it does, so the file is handed over
// the moment nvim is listening rather than a round trip later. On a warm editor it is the same tick
// either way.
function openScrollback(page: Page): void {
  const pane = page.panes[page.focused];
  if (!pane) return;
  const sending = bridge.openScrollback(page.slot, page.focused, paneScrollback(pane.terminal));
  setMode('nvim');
  sending.then(
    (answer) => showError('scrollback', answer.ok ? '' : answer.message),
    (error: unknown) => showError('scrollback', `Could not open the scrollback: ${String(error)}`),
  );
}

// Naming the focused pane. What you type wins over the title the program in it sets, and an empty box
// clears it back to following the title — the overlay's two answers, kept apart here: null is a cancel
// and changes nothing.
//
// The grid's five only, and nothing here enforces that: the action's scope does. `terminals` names the
// one view the editor is not on, so the key cannot be pressed while the editor has the keyboard.
function namePane(page: Page): void {
  const pane = page.panes[page.focused];
  if (!pane) return;
  // The placeholder is what the pane is called with no name of yours, so you can see what you are
  // overriding — and, on a pane already saying something useful, that there is nothing worth typing.
  void promptOverlay(
    'Name this pane',
    pane.typedName ?? '',
    pane.title?.trim() || 'unnamed',
    'Enter names it. An empty box goes back to following the title. Escape keeps what it has.',
  ).then((answer) => {
    // Stored as typed and trimmed on the way out, by paneName, which is where every name arrives.
    if (answer !== null) pane.typedName = answer;
    // The keyboard goes back to the pane whichever way the dialog went: the sheet that held it has been
    // removed, so without this the keystrokes land on <body> and typing in the pane does nothing.
    // showPage redraws the status on its way through, and that redraw writes the session file, which is
    // what makes the name last a restart.
    showPage(activeIndex);
  });
}

function report(task: Promise<void>): void {
  task.then(
    // Clears its own message and no one else's: a project that opens says nothing about a board that
    // could not be written.
    () => showError('project', ''),
    (error: unknown) => showError('project', `Failed to open project: ${String(error)}`),
  );
}

// The keys for the screen in front of you. With no project open that screen is the manager, which is
// a page like any other and has its own section in the dialog.
function showHelp(): void {
  const page = pages[activeIndex];
  openHelp(page.mode, !isProjectPage(page), settings.keys, isMac)
    .then(() => showPage(activeIndex));
}

function showSettings(): void {
  openSettings(settings, isMac, (next) => {
    settings = next;
    void bridge.saveSettings(next).then((shell) => { shellCommand = shell; });
    applyAppearance();
  }).then(() => {
    showPage(activeIndex);
    // A rebinding changes what two lines of text say: the command screen's hint and the status bar's
    // picker key. Neither is redrawn by landing back on the page you never left, so ask for both here.
    pages[activeIndex].command?.render();
    renderStatus();
  });
}

function apply(action: Action): void {
  if (action.kind === 'project-picker') return report(showPicker());
  if (action.kind === 'help') return showHelp();
  if (action.kind === 'settings') return showSettings();
  if (action.kind === 'worktrees') return void openWorktrees(bridge, () => worktrees, jumpToWorktree).then(() => {
    // The same reclaim every other dialog does, and it is what keeps the keyboard on a pane Enter
    // landed on: goToPane has already moved activeIndex, so this focuses where you were sent. A
    // removal made in the dialog has already reached the boards on its own.
    showPage(activeIndex);
  });
  const page = pages[activeIndex];
  // The one key aimed at the page rather than at a row: on a project it closes the project you are on.
  // The manager is not a project and has nothing of its own to close, so there it falls through to its
  // list, where the highlight says which project is meant. Its other two sections have no highlight
  // naming one project, so the key does nothing on them and Ctrl+H still lists it; CLAUDE.md's help
  // section says why.
  if (action.kind === 'project-close' && isProjectPage(page)) return closeProject(page.slot);
  switch (action.kind) {
    case 'project-last': {
      const position = positionOfSlot(previousSlot);
      return position === -1 ? undefined : showPage(position);
    }
    case 'project-next': return showPage(activeIndex + 1);
    case 'project-previous': return showPage(activeIndex - 1);
    case 'project-jump':
      if (action.index < pages.length) showPage(action.index);
      return;
    case 'project-move': return moveProject(action.index);
    case 'mode-set': return setMode(action.mode);
    case 'terminal-focus': return focusTerminal(action.index);
    case 'terminal-next': return focusTerminal(page.focused + 1);
    case 'terminal-previous': return focusTerminal(page.focused - 1);
    case 'terminal-move': return focusTerminal(neighbor(page.focused, action.direction));
    case 'terminal-zoom': return toggleZoom(page);
    case 'terminal-scrollback': return openScrollback(page);
    case 'terminal-name': return namePane(page);
    // Straight to the focused shell: onData already routes it to the pty.
    case 'terminal-input': return page.panes[page.focused]?.terminal.input(action.data);
    case 'section-move': return setMode(nextSectionMode(page.mode, action.direction));
    case 'command-select':
    case 'command-open':
    case 'command-cancel': return page.command?.runAction(action);
    // Whatever is left belongs to the screen you are on, which its mode names. Reached from here
    // rather than from each view's own listener, so one lookup decides every key on every screen —
    // and a fifth screen costs nothing but its mode.
    default: return (page.mode === 'manager' ? page.manager : page.board)?.runAction(action);
  }
}

// Capture phase runs before xterm's own key handler, so the shell never sees these keys.
window.addEventListener('keydown', (event) => {
  // A dialog that is up owns the keyboard; overlay.ts says what counts as one. xterm's textarea is
  // inside none of them, so a pane keeps its shortcuts.
  if (event.target instanceof Element && event.target.closest(OVERLAY_SELECTOR)) return;
  const page = pages[activeIndex];
  const action = mapShortcut(event, settings.keys, page.mode, !isProjectPage(page));
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  apply(action);
}, true);

// Both halves of a drop have to be cancelled here, and cancelling them at the window covers every pane
// too, since the events bubble. Without it a file dropped on the page navigates the window to it,
// replacing the whole dashboard with the file's contents, and no pane ever gets a drop at all.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

window.addEventListener('resize', fitAllPages);

// Clicking the banner lands you on the pane that raised it. The page has to be put on the right view
// and told which pane is focused before it is shown, because showPage lands on whatever the page was
// already showing. A slot with no page any more — the project was closed while the banner sat there —
// is nowhere to go.
bridge.onNotificationClick((paneId) => {
  // A dialog owns the keyboard while it is up. Move the page out from under one and the sheet stays
  // drawn with the keystrokes going to a shell behind it.
  if (document.querySelector(OVERLAY_SELECTOR)) return;
  const { slot, index } = paneFromId(paneId);
  goToPane(slot, index);
});

// Something other than the app wrote a board.json — the `board` command an agent runs, or a hand
// edit. Only the page in front is told: a hidden board is re-read in full when you arrive at it, and
// a board that is not on screen has nothing to redraw. The manager's stack of boards is one of these
// too, and finds the project the path belongs to itself.
bridge.onBoardChange((projectPath) => {
  const page = pages[activeIndex];
  if (page.mode !== 'board') return;
  page.board?.reload(projectPath);
});

// The three ways to be sent to a pane you are not on: clicking its notification, pressing Enter on its
// row in the manager, and pressing Enter on its row in the worktree list. One function, so none of
// them lands somewhere another would not — including on the right view, which modeOfPane decides.
function goToPane(slot: number, index: number): void {
  const position = positionOfSlot(slot);
  if (position === -1) return;
  const page = pages[position];
  const mode = modeOfPane(index);
  showMode(page, mode);
  // The editor is not one of the grid's five, so it has no place in `focused`: nvim is the whole view.
  if (mode === 'terminals') page.focused = index;
  showPage(position, true);
}

// Enter on a row of the worktree list. Two rows have nowhere to send you, and both say so rather than
// looking like a key that did nothing: a worktree with no pane is one whose ship found every pane in
// use, or one the app has restarted since, and a project closed since its card shipped has no page to
// land on. Neither opens anything on your behalf — Enter here is "take me there", not "start it".
function jumpToWorktree(entry: WorktreeEntry): string {
  if (entry.pane === null) return `${entry.branch} has no pane — nothing of it is running`;
  const page = pages.find((candidate) => candidate.project.path === entry.projectPath);
  if (!page) return `${entry.branch} is in a project that is not open`;
  goToPane(page.slot, entry.pane);
  return '';
}

// Typing the command screen's command into the shells themselves. That screen marks projects, so which
// pane in each of them takes the line, and which projects can take it at all, is free-pane.ts's to
// answer. terminal.input is the same door answerPane and a dropped file already go through, and the
// carriage return is what an Enter in the pane sends.
function sendToPanes(command: string, paths: readonly string[]): SendPlan {
  // One array, both jobs: what planSend is asked about, and where the line is then delivered. Two
  // collections built from the same filter is how a project comes to be planned for and not written
  // to, or written to after the plan has left it out.
  const chosen = projectPages().filter((page) => paths.includes(page.project.path));
  const plan = planSend(chosen.map((page) => ({
    name: page.project.name,
    path: page.project.path,
    // A project whose folder has gone keeps its page, and that page has no panes — so free-pane.ts is
    // told why, rather than being left to report an empty project as one whose panes were all taken.
    missing: page.project.missing,
    // The five shells, never the editor. It rings a bell like a pane and is listed like one, but a
    // line of shell typed into nvim is not a command, it is an edit to whatever file is open.
    panes: page.panes.map(paneUse),
  })));
  // The plan's own answer, keyed by the path it names, so nothing here decides a second time which
  // projects the command reaches. A path with no entry is one the plan deliberately left out — every
  // pane busy, or the folder gone — which is why this loop skips it rather than looking for a pane.
  const planned = new Map(plan.sends.map((send) => [send.path, send.paneIndex]));
  for (const page of chosen) {
    const paneIndex = planned.get(page.project.path);
    if (paneIndex !== undefined) page.panes[paneIndex].terminal.input(`${command}\r`);
  }
  return plan;
}

// Answering a pane from the manager, without going to it. terminal.input is the door a dropped file
// already goes through, so the key reaches the pty by the same path typing into the pane does. The
// bell comes off because the pane has had its answer, and the pane rings again if it asks again. What
// tells you the key landed is the row going from yellow `waiting` to dim `quiet` under a highlight
// that has not moved — the row does not leave the list. That is what the highlight staying put is
// for: the next character is dropped while the pane is quiet, and goes to that same pane the moment
// it asks again, without anyone picking the row a second time.
function answerPane(slot: number, index: number, key: string): void {
  const pane = panesById.get(terminalId(slot, index));
  if (!pane) return;
  pane.terminal.input(key);
  pane.bell = 'quiet';
  renderStatus();
}

bridge.onData((id, data) => {
  const pane = panesById.get(id);
  if (!pane) return;
  pane.lastPrintedAt = Date.now();
  pane.terminal.write(data);
});

// The manager's pane rows are the only thing on any screen that goes stale where it stands: every
// other line is redrawn by whatever changed it, and a pane printing on quietly changes nothing that
// calls a redraw. Without this you open the manager, read `Running 3 of 47 tests` · `just now`
// against a pane, and it still says both an hour later while the pane is long finished.
// Straight into renderStatus, which already draws the manager only when the manager is in front — a
// second copy of that question here is one that could come to disagree with it. It is told the pane
// rows are all it has to change, so the list is not rebuilt under someone who is reading it.
const PANE_REFRESH_MS = 30_000;
window.setInterval(() => renderStatus(true), PANE_REFRESH_MS);
bridge.onExit((id, exitCode) => {
  const pane = panesById.get(id);
  if (!pane) return;
  pane.exited = true;
  // The title dies with the program that set it, which is here. Left standing, the bar names a file
  // nothing has open: quit nvim and the pane still reads `nvim · board.json` until you press Enter and
  // the next nvim prints its own. A typed name is untouched — that one is yours and survives a restart.
  pane.title = undefined;
  pane.terminal.write(`\r\n[exited ${exitCode}] press Enter to restart\r\n`);
  // The pane says so to whoever is looking at it; this is what tells the manager, which is where you
  // find out about a pane on a project you are not on.
  renderStatus();
});

// Results arrive one project at a time, from whichever run is going. The manager page is built before
// the first one can land, so there is always a view to hand it to. Found the same way every other
// listener here finds the manager page — the one page isProjectPage says no to — rather than a second
// way of asking the same question.
bridge.onTaskUpdate((result) => {
  pages.find((page) => !isProjectPage(page))?.command?.update(result);
});

// Puts back what the last run was left on: the same projects in the same order, each on the view it was
// showing, with the same pane focused. One at a time, because main hands out a slot per project in the
// order they are opened and that order is the tab strip.
async function restore(session: Session): Promise<void> {
  // Best-effort: one project that cannot be opened at all — a folder you have lost read permission on,
  // so the main process throws rather than reporting it missing — must not leave `restoring` set for
  // the rest of the run. That would silently stop every later save, and a day's work would open
  // tomorrow as yesterday's layout. Half the layout back and saving is better than neither.
  try {
    for (const entry of session.pages) {
      // One folder you cannot stat must not cost you the projects saved behind it: the rest of the
      // layout still opens, and only the one that threw is dropped from this run.
      try {
        await openProject(entry.path);
      } catch (error: unknown) {
        // Said out loud, because the save below rewrites session.json without this project: grant the
        // folder back next week and it is not in the layout any more. Last failure wins the span, which
        // is the difference between "it is gone" and "it is gone and I have no idea why".
        showError('start', `Failed to open ${entry.path}: ${String(error)}`);
      }
    }
    for (const entry of session.pages) {
      // By path, not position: an entry that failed to open has no page, so the two lists no longer
      // line up and index 3 would hand project 4's view to project 5.
      const page = pages.find((candidate) => candidate.project.path === entry.path);
      // A folder that went away while the app was closed comes back as the same dead page it would have
      // become had it gone away mid-run. There is no view on it to restore.
      if (!page || page.project.missing) continue;
      showMode(page, entry.mode);
      page.focused = entry.focused;
      // Only the names you typed come back. A title dies with the program that set it, so a restored
      // pane says nothing until whatever starts in it speaks up.
      entry.names.forEach((name, index) => {
        if (name !== null && page.panes[index]) page.panes[index].typedName = name;
      });
    }
  } finally {
    // Saving again from here on, so the landing below is what writes the restored layout back — with any
    // project whose folder has gone missing already dropped from it.
    restoring = false;
    const activePath = session.pages[session.activeIndex]?.path;
    const saved = pages.findIndex((page) => page.project.path === activePath);
    showPage(landingPosition(saved, pages.findIndex(isProjectPage)), true);
  }
}

// The window opens with whatever was open last time, behind the manager tab; with nothing saved, the
// manager is all there is and the picker makes the first project.
async function start(): Promise<void> {
  // First, and before anything draws: the tab strip is `pages` in order, so this is what puts the
  // manager at the front of it, and renderStatus below has a page to draw.
  const manager = buildManagerPage();
  pagesElement.append(manager.element);
  pages.push(manager);
  renderStatus();
  // Read once, then kept fresh by main, which owns the record and says when it changes — so nothing
  // here polls for it. Both after the manager page is pushed, because drawing the status bar needs a
  // page and the sweep for dead worktrees can land mid-launch.
  // A failure to read the local record costs a branch name, never the screen.
  void bridge.listWorktrees().then(applyWorktrees, () => undefined);
  bridge.onWorktreeChange(applyWorktrees);
  const loaded = await bridge.getSettings();
  settings = loaded.settings;
  shellCommand = loaded.shellCommand;
  // Read before anything is on screen, because the first page to open starts saving over it.
  const session = await bridge.getSession();
  // xterm measures cell size when a pane opens, so both weights must be in before openProject()
  // builds one, or the glyphs misalign. A font name the browser cannot parse — anything typed into
  // the settings screen, which does not check — rejects here instead of resolving; xterm falls back
  // to Menlo on its own, so losing the preload must cost only that fallback, not the whole session.
  try {
    await Promise.all([
      document.fonts.load(`${settings.font.size}px "${settings.font.name}"`),
      document.fonts.load(`bold ${settings.font.size}px "${settings.font.name}"`),
    ]);
  } catch {
    // Fallen through to whatever xterm renders instead.
  }
  applyAppearance();
  await restore(session);
}

start().catch((error: unknown) => {
  showError('start', `Failed to start: ${String(error)}`);
});
