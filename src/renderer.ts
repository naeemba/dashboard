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
  if (page.mode === 'board') return `board · ${page.board?.columnName() ?? ''}`;
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
function setMode(mode: Mode): void {
  const page = pages[activeIndex];
  if (page.project.missing) return;
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) view.hidden = name !== mode;
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

function showPage(index: number): void {
  if (pages.length === 0) return renderStatus();
  const next = (index + pages.length) % pages.length;
  // Landing back on the page you are already on — Escape closing the picker, a folder dialog cancelled —
  // only needs its keyboard focus back, not a fresh arrival at its mode.
  if (next === activeIndex) return focusMode(pages[activeIndex], false);
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

// The window opens with no projects; the picker makes the first one.
async function start(): Promise<void> {
  renderStatus();
  // xterm measures cell size when a pane opens, so both font weights must be in before openProject()
  // builds one, or the glyphs misalign.
  await Promise.all([
    document.fonts.load(`${FONT_SIZE}px "${FONT_NAME}"`),
    document.fonts.load(`bold ${FONT_SIZE}px "${FONT_NAME}"`),
  ]);
}

start().catch((error: unknown) => {
  showError('start', `Failed to start: ${String(error)}`);
});
