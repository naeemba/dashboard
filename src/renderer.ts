import '@xterm/xterm/css/xterm.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { openHelp } from './help';
import { mapShortcut, type Action } from './shortcuts';
import { type Mode } from './modes';
import { openPicker } from './picker';
import { openWorktrees } from './worktree-view';
import { createBoardView, type BoardView } from './board-view';
import { quoteForShell } from './shell';
import { TITLE_BAR_HEIGHT } from './theme';
import { EDITOR_INDEX, TERMINAL_COUNT, modeOfPane, neighbor, paneFromId, paneLabel, terminalId } from './terminals';
import { terminalStatus, type StatusPage } from './status';
import type { Project } from './projects';
import type { Session } from './session';
import type { WorktreeEntry } from './worktree-store';
import { defaultSettings, type Settings } from './settings';
import { openSettings } from './settings-view';
import { OVERLAY_SELECTOR } from './overlay';
import {
  type Bell, isRinging, looksBusy, marksWaiting, raisesNotification, redrawsForBell, waitingNames,
} from './waiting';
import {
  MANAGER_PROJECT, MANAGER_SLOT, isProjectPage, landingPosition, managerRows, projectPosition,
  tailLines,
} from './manager';
import { createManagerView, type ManagerView } from './manager-view';
import { createCardsView } from './cards-view';
import { actionByName } from './actions';

// `name` is what the status bar and the bell's notification call the pane; `bell` is whether the pane
// is asking for you and whether its banner has already gone out, so a pane that rings ten times does
// not raise ten of them.
// `bellTimer` is the one verdict a pane has pending on its own bell, held so a second ring inside the
// wait joins it rather than starting another.
type Pane = {
  terminal: Terminal;
  fit: FitAddon;
  exited: boolean;
  name: string;
  bell: Bell;
  bellTimer?: number;
};

// How long a bell waits before it is believed. Long enough that an agent handed more work has drawn
// its spinner again, short enough that a real question is on the tab strip before you look up.
const BELL_SETTLE_MS = 1000;
type Page = {
  project: Project;
  element: HTMLElement;
  // Only the views this page actually has. A project has three; the manager has one; a dead project
  // has none, and that is what stops the mode keys switching it to a view that was never built.
  views: Partial<Record<Mode, HTMLElement>>;
  mode: Mode;
  panes: Pane[];
  focused: number;
  slot: number;
  editor: Pane | null;
  editorStarted: boolean;
  board: BoardView | null;
  // Only the manager page has one, the way only a project page has a board.
  manager: ManagerView | null;
};

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

function fontFamily(): string {
  return `"${settings.font.name}", Menlo, Monaco, monospace`;
}

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
const panesById = new Map<string, Pane>();
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
function refreshWorktrees(): void {
  // A failure to read the local record costs a branch name, never the screen.
  void bridge.listWorktrees().then((entries) => { worktrees = entries; renderStatus(); }, () => undefined);
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
    pickerBinding: settings.keys['project-picker'] ?? 'Nothing',
    pickerDescription: actionByName('project-picker')?.description ?? '',
    worktrees: worktrees.filter((entry) => entry.projectPath === page.project.path),
  };
}

// The grid's five and the editor, which rings its bell like any other pane.
function allPanes(page: Page): Pane[] {
  return page.editor === null ? page.panes : [...page.panes, page.editor];
}

// What a pane has on its screen, which is what you would see if you went there: xterm has already laid
// the bytes out, so the escape codes, the redraws and the spinner overwriting itself are all resolved
// before this reads a line. The live screen rather than the scrollback, so scrolling a pane by hand
// does not change what the manager says about it.
function paneScreen(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active;
  return Array.from(
    { length: terminal.rows },
    (_value, row) => buffer.getLine(buffer.baseY + row)?.translateToString(true) ?? '',
  );
}

// What the manager prints on a row, which is the last few lines of the same screen. The bell reads
// the screen whole instead, so how much of it a row has space for cannot decide what a bell means.
function paneTail(terminal: Terminal): string[] {
  return tailLines(paneScreen(terminal));
}

// The manager page is pushed before the first call, so there is always a page to draw.
function renderStatus(): void {
  const page = pages[activeIndex];
  // Before the status bar reads its label off the selection. The rows are the pages themselves, so a
  // bell, an exit or a project opening all reach the manager through the redraw they already cause —
  // and only while you are looking at it, since arriving redraws too and typing a card title on a
  // board should not rebuild a list nobody can see.
  if (page.mode === 'manager') {
    page.manager?.render(managerRows(projectPages().map((entry) => ({
      project: entry.project,
      slot: entry.slot,
      panes: allPanes(entry).map((pane) => ({ ...pane, tail: () => paneTail(pane.terminal) })),
    }))));
  }
  titleElement.textContent = `📁 ${page.project.name}`;
  // A span each: the open project is marked by a highlight, the way a tab strip marks one, and a
  // project with a pane ringing its bell is marked again so you can see it from another page.
  statusProjects.replaceChildren(...pages.map((entry, index) => {
    const tab = document.createElement('span');
    tab.className = 'project';
    tab.classList.toggle('active', index === activeIndex);
    tab.classList.toggle('waiting', waitingNames(allPanes(entry)).length > 0);
    tab.textContent = entry.project.name;
    return tab;
  }));
  statusTerminal.textContent = terminalStatus(statusPage(page), waitingNames(allPanes(page)));
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
    pages: live.map((page) => ({ path: page.project.path, mode: page.mode, focused: page.focused })),
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
  for (const pane of panesById.values()) {
    // A plain record of hex strings on the way in; xterm names the colours it knows. parseSettings
    // has already dropped anything that is not one of them, so the shapes agree.
    pane.terminal.options.theme = settings.theme as ITheme;
    pane.terminal.options.fontFamily = fontFamily();
    pane.terminal.options.fontSize = settings.font.size;
  }
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

// Switching mode is per page, so each project keeps the view you left it on. A dead project has no
// views to switch between and ignores the keys.
// The mode and which view is on screen are one fact, so they only ever move together. Restoring a page
// sets them without arriving at it, which is why this is not simply the top of setMode.
function showMode(page: Page, mode: Mode): void {
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) if (view) view.hidden = name !== mode;
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

// `entering` is true for a genuine arrival at the page's current mode — switching modes, or switching to
// a different page — and false for merely reclaiming the keyboard, such as the picker closing on the
// page you never left. Only a genuine arrival may start nvim or re-read the board: re-opening the board
// on every refocus would throw away its undo step each time, since board.open() resets it.
function focusMode(page: Page, entering: boolean): void {
  if (page.mode === 'manager') page.views.manager?.focus();
  if (page.mode === 'terminals') return focusTerminal(page.focused);
  if (page.mode === 'nvim' && page.editor) {
    // Started the first time you ask for it, through the same path a dead pane restarts by. Quit
    // nvim and the pane says so and waits for Enter, exactly like a shell that has exited.
    if (entering && !page.editorStarted) {
      page.editorStarted = true;
      bridge.restart(terminalId(page.slot, EDITOR_INDEX));
      bridge.resize(terminalId(page.slot, EDITOR_INDEX), page.editor.terminal.cols, page.editor.terminal.rows);
    }
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
    for (const pane of page.panes) pane.fit.fit();
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
  activeIndex = next;
  pages.forEach((page, pageIndex) => {
    page.element.hidden = pageIndex !== activeIndex;
  });
  focusMode(pages[activeIndex], true);
}

function buildPane(view: HTMLElement, id: string, page: Page, name: string, onFocus?: () => void): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  view.append(container);

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: settings.font.size,
    fontFamily: fontFamily(),
    theme: settings.theme as ITheme,
    drawBoldTextInBrightColors: false,
    // Option+key sends Esc+key, the way every terminal on macOS does. Without it xterm hands the pane
    // the composed character instead — Option+L arrives as "Â¬", and nvim's <A-l> never fires. The
    // cost is that Option no longer types accented characters into a pane.
    macOptionIsMeta: true,
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  // A URL in the output underlines under the pointer and opens in the real browser when clicked; main
  // decides what is safe to hand the operating system.
  terminal.loadAddon(new WebLinksAddon((_event, uri) => bridge.openExternal(uri)));
  terminal.open(container);

  const pane: Pane = { terminal, fit, exited: false, name, bell: 'quiet' };
  terminal.onData((data) => {
    if (!pane.exited) {
      bridge.sendInput(id, data);
      return;
    }
    if (data === '\r') {
      pane.exited = false;
      terminal.reset();
      bridge.restart(id);
      bridge.resize(id, terminal.cols, terminal.rows);
    }
  });
  // Dropping files types their absolute paths at the prompt, quoted, the way a terminal is expected to
  // take them. It goes through terminal.input so a dead pane ignores the drop like any other keystroke.
  // The trailing space is what every terminal appends, so a second drop starts a new word instead of
  // gluing itself onto the first path.
  container.addEventListener('drop', (event) => {
    const paths = [...event.dataTransfer?.files ?? []].map((file) => bridge.getPathForFile(file));
    if (paths.length === 0) return;
    terminal.focus();
    terminal.input(`${paths.map((entry) => quoteForShell(entry, shellCommand)).join(' ')} `);
  });
  terminal.onResize(({ cols, rows }) => bridge.resize(id, cols, rows));
  // The bell is the only thing a program in a pane can ring to say it wants you, and it costs nothing
  // to listen for: no reading the output, no guessing from how long it has been quiet.
  // The pane you are looking at is the one whose keystrokes go to xterm's hidden textarea, so asking
  // the document who has focus answers both "is this page in front" and "is this the focused pane" at
  // once, and answers it right on the board, where no pane has the keyboard at all. What the states of
  // the bell mean is waiting.ts's job; this only reads them and draws the answer.
  // Where you were when it rang is what says whether the bell is news, so that is read now: leave the
  // pane in the second that follows and the mark would otherwise go up on the pane you just read.
  // What the bell meant is the part that has to wait — a moment later the screen says whether the
  // agent asked you something or went back to work.
  terminal.onBell(() => {
    if (!marksWaiting(document.hasFocus(), terminal.textarea === document.activeElement)) return;
    // One verdict per wait, not one per ring. An agent can ring every second, and without this each
    // ring leaves its own timer behind to read the whole screen again for the same answer.
    if (pane.bellTimer !== undefined) return;
    pane.bellTimer = window.setTimeout(() => {
      pane.bellTimer = undefined;
      // What counts as still working is waiting.ts's to answer; this hands it the screen.
      if (looksBusy(paneScreen(terminal))) return;
      // Whether a repeat bell is worth a redraw is waiting.ts's to answer; this reads which page is in
      // front and draws what it says.
      const redraws = redrawsForBell(pane.bell, pages[activeIndex].mode === 'manager');
      if (!isRinging(pane.bell)) pane.bell = 'waiting';
      if (redraws) renderStatus();
      // Read again rather than reused from above: the banner is only worth raising if the window is
      // still behind something else now, which is when it would actually appear.
      if (raisesNotification(document.hasFocus(), pane.bell)) {
        pane.bell = 'notified';
        bridge.notify(page.project.name, `${pane.name} is waiting`, id);
      }
    }, BELL_SETTLE_MS);
  });
  // Arriving at the pane is the answer to whatever it was asking, so the mark comes off here rather
  // than in the focus handlers: this fires for every way in, including landing back on the pane the
  // page already called focused, which the caller's onFocus deliberately ignores.
  // onFocus first: it is what sets page.focused, and the redraw writes the session file, so redrawing
  // before it would save a session naming the pane you just left.
  terminal.textarea?.addEventListener('focus', () => {
    const wasRinging = isRinging(pane.bell);
    pane.bell = 'quiet';
    onFocus?.();
    if (wasRinging) renderStatus();
  });
  return pane;
}

// The one page with no folder behind it, so none of what buildPage makes: no shells and no editor. It
// has two views — the list of what every project's panes want, and every project's board — and the
// mode keys for the two it does not have do nothing here.
// Its board is a board like any other as far as this file is concerned: same field, same mode, same
// four functions. What is behind it is one real board per open project rather than one for a folder.
function buildManagerPage(): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const manager = createManagerView({
    onJump: goToPane, onAnswer: answerPane, onChanged: renderStatus,
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
    onShipped: refreshWorktrees,
  });
  element.append(manager.element, cards.element);
  const page: Page = {
    project: MANAGER_PROJECT, element, views: { manager: manager.element, board: cards.element },
    mode: 'manager', panes: [], focused: 0, slot: MANAGER_SLOT, editor: null, editorStarted: false,
    board: cards, manager,
  };
  // Which view is on screen and which mode the page is in are one fact, and showMode is where they are
  // set together — including here, where the page has not been arrived at yet.
  showMode(page, 'manager');
  return page;
}

function buildPage(project: Project, slot: number): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const views: Record<'terminals' | 'nvim' | 'board', HTMLElement> = {
    terminals: document.createElement('div'),
    nvim: document.createElement('div'),
    board: document.createElement('div'),
  };
  for (const [mode, view] of Object.entries(views)) {
    view.className = `view view-${mode}`;
    view.hidden = mode !== 'terminals';
  }
  const page: Page = {
    project, element, views, mode: 'terminals', panes: [], focused: 0, slot, editor: null,
    editorStarted: false, board: null, manager: null,
  };
  // Deliberate insurance against one race: the picker only offers folders that exist, so the sole way here
  // is deleting the folder between the dialog closing and the existence check. Then you get this page
  // instead of a blank one with no shells.
  if (project.missing) {
    element.classList.add('missing');
    element.textContent = `Directory not found: ${project.path}`;
    // A dead project has no views: there is nothing to run nvim in and nowhere to keep a board.
    page.views = {};
    return page;
  }
  element.append(...Object.values(views));
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(slot, terminalIndex);
    const pane = buildPane(views.terminals, id, page, paneLabel(terminalIndex), () => {
      if (page.focused === terminalIndex) return;
      page.focused = terminalIndex;
      renderStatus();
    });
    page.panes.push(pane);
    panesById.set(id, pane);
  }
  const editorId = terminalId(slot, EDITOR_INDEX);
  page.editor = buildPane(views.nvim, editorId, page, 'nvim');
  panesById.set(editorId, page.editor);
  page.board = createBoardView({
    projectPath: project.path,
    slot,
    bridge,
    onChanged: renderStatus,
    // A slot each, so one project's board never clears another one's failure.
    onError: (message) => showError(`board:${slot}`, message),
    onShipped: refreshWorktrees,
  });
  views.board.append(page.board.element);
  return page;
}

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
  openHelp(pages[activeIndex].mode, settings.keys, isMac)
    .then(() => showPage(activeIndex));
}

function showSettings(): void {
  openSettings(settings, isMac, (next) => {
    settings = next;
    void bridge.saveSettings(next).then((shell) => { shellCommand = shell; });
    applyAppearance();
  }).then(() => showPage(activeIndex));
}

function apply(action: Action): void {
  if (action.kind === 'project-picker') return report(showPicker());
  if (action.kind === 'help') return showHelp();
  if (action.kind === 'settings') return showSettings();
  if (action.kind === 'worktrees') return void openWorktrees(bridge).then(refreshWorktrees);
  const page = pages[activeIndex];
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
    // Straight to the focused shell: onData already routes it to the pty.
    case 'terminal-input': return page.panes[page.focused]?.terminal.input(action.data);
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
  const action = mapShortcut(event, settings.keys, pages[activeIndex].mode);
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

// The two ways to be sent to a pane you are not on: clicking its notification, and pressing Enter on
// its row in the manager. One function, so the second never lands somewhere the first would not.
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

// Answering a pane from the manager, without going to it. terminal.input is the door a dropped file
// already goes through, so the key reaches the pty by the same path typing into the pane does. The
// bell comes off because the pane has had its answer: the row leaving the list is the only sign the
// key landed, and the pane rings again if it asks again.
function answerPane(slot: number, index: number, key: string): void {
  const pane = panesById.get(terminalId(slot, index));
  if (!pane) return;
  pane.terminal.input(key);
  pane.bell = 'quiet';
  renderStatus();
}

bridge.onData((id, data) => panesById.get(id)?.terminal.write(data));
bridge.onExit((id, exitCode) => {
  const pane = panesById.get(id);
  if (!pane) return;
  pane.exited = true;
  pane.terminal.write(`\r\n[exited ${exitCode}] press Enter to restart\r\n`);
  // The pane says so to whoever is looking at it; this is what tells the manager, which is where you
  // find out about a pane on a project you are not on.
  renderStatus();
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
  refreshWorktrees();
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
