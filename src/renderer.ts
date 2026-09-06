import '@xterm/xterm/css/xterm.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { mapShortcut, type Action } from './shortcuts';
import { type Mode } from './modes';
import { openPicker } from './picker';
import { createBoardView, type BoardView } from './board-view';
import { quoteForShell } from './shell';
import { THEME, TITLE_BAR_HEIGHT } from './theme';
import { TERMINAL_COUNT, neighbor, terminalId } from './terminals';
import type { Project } from './projects';
import type { Session } from './session';

// Ghostty's stock look (`ghostty +show-config --default`): JetBrains Mono at 13pt with THEME's palette.
const FONT_NAME = 'JetBrains Mono';
const FONT_SIZE = 13;

for (const [name, value] of Object.entries(THEME)) {
  document.documentElement.style.setProperty(`--${name}`, String(value));
}
document.documentElement.style.setProperty('--title-bar-height', `${TITLE_BAR_HEIGHT}px`);

// The editor is a sixth pty for the project, sitting one past the grid's five.
const EDITOR_INDEX = TERMINAL_COUNT;

type Pane = { terminal: Terminal; fit: FitAddon; exited: boolean };
type Page = {
  project: Project;
  element: HTMLElement;
  views: Record<Mode, HTMLElement>;
  mode: Mode;
  panes: Pane[];
  focused: number;
  slot: number;
  editor: Pane | null;
  editorStarted: boolean;
  board: BoardView | null;
};

const bridge = window.dashboard;
const isMac = bridge.platform === 'darwin';
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

// The right-hand span says which view you are in, and for terminals which pane has the keyboard.
function modeLabel(page: Page): string {
  if (page.mode === 'nvim') return 'nvim';
  if (page.mode === 'board') return `board · ${page.board?.statusLabel() ?? ''}`;
  return page.panes.length > 0 ? `terminal ${page.focused + 1}` : '';
}

function renderStatus(): void {
  if (pages.length === 0) {
    // document.title already holds the app's name, so the empty title row does not spell it out again.
    titleElement.textContent = `📁 ${document.title}`;
    statusProjects.textContent = 'Ctrl+S opens the project list';
    statusTerminal.textContent = '';
    return;
  }
  const page = pages[activeIndex];
  titleElement.textContent = `📁 ${page.project.name}`;
  // A span each: the open project is marked by a highlight, the way a tab strip marks one.
  statusProjects.replaceChildren(...pages.map((entry, index) => {
    const tab = document.createElement('span');
    tab.className = index === activeIndex ? 'project active' : 'project';
    tab.textContent = entry.project.name;
    return tab;
  }));
  statusTerminal.textContent = modeLabel(page);
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
  if (restoring || pages.length === 0) return;
  // A project whose folder went away is not written back. It stays on screen for this run — nothing
  // closes a page — but the next launch starts without it, instead of reopening the same dead tab and
  // saving it again forever. The project list already works this way: a missing project is neither
  // offered by Ctrl+S nor remembered as a recent.
  const live = pages.filter((page) => !page.project.missing);
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
  for (const [name, view] of Object.entries(page.views)) view.hidden = name !== mode;
}

function setMode(mode: Mode): void {
  const page = pages[activeIndex];
  if (page.project.missing) return;
  showMode(page, mode);
  focusMode(page, true);
}

// `entering` is true for a genuine arrival at the page's current mode — switching modes, or switching to
// a different page — and false for merely reclaiming the keyboard, such as the picker closing on the
// page you never left. Only a genuine arrival may start nvim or re-read the board: re-opening the board
// on every refocus would throw away its undo step each time, since board.open() resets it.
function focusMode(page: Page, entering: boolean): void {
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
// one. Only the restore needs it: it lands on a page nobody has visited yet this run, so nvim has to
// start and the board has to be read, exactly as if you had just switched to it.
function showPage(index: number, arriving = false): void {
  if (pages.length === 0) return renderStatus();
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

function buildPane(view: HTMLElement, id: string, onFocus?: () => void): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  view.append(container);

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: FONT_SIZE,
    fontFamily: `"${FONT_NAME}", Menlo, Monaco, monospace`,
    theme: THEME,
    drawBoldTextInBrightColors: false,
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  // A URL in the output underlines under the pointer and opens in the real browser when clicked; main
  // decides what is safe to hand the operating system.
  terminal.loadAddon(new WebLinksAddon((_event, uri) => bridge.openExternal(uri)));
  terminal.open(container);

  const pane: Pane = { terminal, fit, exited: false };
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
    terminal.input(`${paths.map((entry) => quoteForShell(entry, bridge.shellCommand)).join(' ')} `);
  });
  terminal.onResize(({ cols, rows }) => bridge.resize(id, cols, rows));
  terminal.textarea?.addEventListener('focus', () => onFocus?.());
  return pane;
}

function buildPage(project: Project, slot: number): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const views: Record<Mode, HTMLElement> = {
    terminals: document.createElement('div'),
    nvim: document.createElement('div'),
    board: document.createElement('div'),
  };
  for (const [mode, view] of Object.entries(views)) {
    view.className = `view view-${mode}`;
    view.hidden = mode !== 'terminals';
  }
  const page: Page = {
    project, element, views, mode: 'terminals', panes: [], focused: 0, slot, editor: null, editorStarted: false,
    board: null,
  };
  // Deliberate insurance against one race: the picker only offers folders that exist, so the sole way here
  // is deleting the folder between the dialog closing and the existence check. Then you get this page
  // instead of a blank one with no shells. A dead project has no views: there is nothing to run nvim in
  // and nowhere to keep a board.
  if (project.missing) {
    element.classList.add('missing');
    element.textContent = `Directory not found: ${project.path}`;
    return page;
  }
  element.append(...Object.values(views));
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(slot, terminalIndex);
    const pane = buildPane(views.terminals, id, () => {
      if (page.focused === terminalIndex) return;
      page.focused = terminalIndex;
      renderStatus();
    });
    page.panes.push(pane);
    panesById.set(id, pane);
  }
  const editorId = terminalId(slot, EDITOR_INDEX);
  page.editor = buildPane(views.nvim, editorId);
  panesById.set(editorId, page.editor);
  page.board = createBoardView({
    projectPath: project.path,
    bridge,
    onChanged: renderStatus,
    // A slot each, so one project's board never clears another one's failure.
    onError: (message) => showError(`board:${slot}`, message),
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
// untouched; only the order you cycle and jump through changes.
function moveProject(index: number): void {
  if (index >= pages.length) return;
  pages.splice(index, 0, ...pages.splice(activeIndex, 1));
  activeIndex = index;
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
  for (const page of pages) if (!page.project.missing) byPath.set(page.project.path, page.project);
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

function apply(action: Action): void {
  if (action.kind === 'project-picker') return report(showPicker());
  if (pages.length === 0) return;
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
  }
}

// Capture phase runs before xterm's own key handler, so the shell never sees these keys.
window.addEventListener('keydown', (event) => {
  // The picker and a card being edited own every key typed inside them. xterm's textarea is outside
  // both, so a pane keeps its shortcuts.
  if (event.target instanceof Element && event.target.closest('.picker, .board-edit')) return;
  const action = mapShortcut(event, isMac, pages[activeIndex]?.mode);
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

bridge.onData((id, data) => panesById.get(id)?.terminal.write(data));
bridge.onExit((id, exitCode) => {
  const pane = panesById.get(id);
  if (!pane) return;
  pane.exited = true;
  pane.terminal.write(`\r\n[exited ${exitCode}] press Enter to restart\r\n`);
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
    for (const entry of session.pages) await openProject(entry.path);
    session.pages.forEach((entry, index) => {
      const page = pages[index];
      // A folder that went away while the app was closed comes back as the same dead page it would have
      // become had it gone away mid-run. There is no view on it to restore.
      if (!page || page.project.missing) return;
      showMode(page, entry.mode);
      page.focused = entry.focused;
    });
  } finally {
    // Saving again from here on, so the landing below is what writes the restored layout back — with any
    // project whose folder has gone missing already dropped from it.
    restoring = false;
    showPage(session.activeIndex, true);
  }
}

// The window opens with whatever was open last time; with nothing saved, the picker makes the first one.
async function start(): Promise<void> {
  renderStatus();
  // Read before anything is on screen, because the first page to open starts saving over it.
  const session = await bridge.getSession();
  // xterm measures cell size when a pane opens, so both font weights must be in before openProject()
  // builds one, or the glyphs misalign.
  await Promise.all([
    document.fonts.load(`${FONT_SIZE}px "${FONT_NAME}"`),
    document.fonts.load(`bold ${FONT_SIZE}px "${FONT_NAME}"`),
  ]);
  await restore(session);
}

start().catch((error: unknown) => {
  showError('start', `Failed to start: ${String(error)}`);
});
