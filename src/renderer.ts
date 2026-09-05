import '@xterm/xterm/css/xterm.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { mapShortcut, type Action } from './shortcuts';
import { openPicker } from './picker';
import { THEME } from './theme';
import { TERMINAL_COUNT, neighbor, terminalId } from './terminals';
import type { Project } from './projects';

// Ghostty's stock look (`ghostty +show-config --default`): JetBrains Mono at 13pt with THEME's palette.
const FONT_NAME = 'JetBrains Mono';
const FONT_SIZE = 13;

for (const [name, value] of Object.entries(THEME)) {
  document.documentElement.style.setProperty(`--${name}`, String(value));
}

type Pane = { terminal: Terminal; fit: FitAddon; exited: boolean };
type Page = { project: Project; element: HTMLElement; panes: Pane[]; focused: number; slot: number };

const bridge = window.dashboard;
const isMac = bridge.platform === 'darwin';
const statusElement = document.getElementById('status') as HTMLElement;
// Projects on the left, the focused pane pushed to the right, so the two are never read as one list.
const statusProjects = document.createElement('span');
const statusTerminal = document.createElement('span');
statusElement.append(statusProjects, statusTerminal);
const pagesElement = document.getElementById('pages') as HTMLElement;
const pages: Page[] = [];
const panesById = new Map<string, Pane>();
let activeIndex = 0;
// Where Ctrl+O goes back to. Held as a slot, the one thing about a page that never changes:
// Ctrl+Shift+digit moves its position, and reopening a project rebuilds the page object itself.
let previousSlot: number | null = null;

function renderStatus(): void {
  if (pages.length === 0) {
    statusProjects.textContent = 'Ctrl+S opens the project list';
    statusTerminal.textContent = '';
    return;
  }
  const page = pages[activeIndex];
  statusProjects.textContent = pages
    .map((entry, index) => (index === activeIndex ? `[${entry.project.name}]` : entry.project.name))
    .join('  ');
  statusTerminal.textContent = page.panes.length > 0 ? `terminal ${page.focused + 1}` : '';
}

function focusTerminal(index: number): void {
  const page = pages[activeIndex];
  if (page.panes.length > 0) {
    page.focused = (index + TERMINAL_COUNT) % TERMINAL_COUNT;
    page.panes[page.focused].terminal.focus();
  }
  renderStatus();
}

function positionOfSlot(slot: number | null): number {
  return pages.findIndex((page) => page.slot === slot);
}

// Hidden pages keep their layout (visibility, not display), so every pane can be fit.
function fitAllPages(): void {
  for (const page of pages) for (const pane of page.panes) pane.fit.fit();
}

function showPage(index: number): void {
  if (pages.length === 0) return renderStatus();
  const next = (index + pages.length) % pages.length;
  if (next !== activeIndex) previousSlot = pages[activeIndex].slot;
  activeIndex = next;
  pages.forEach((page, pageIndex) => {
    page.element.hidden = pageIndex !== activeIndex;
  });
  focusTerminal(pages[activeIndex].focused);
}

function buildPane(page: Page, id: string, terminalIndex: number): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  page.element.append(container);

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: FONT_SIZE,
    fontFamily: `"${FONT_NAME}", Menlo, Monaco, monospace`,
    theme: THEME,
    drawBoldTextInBrightColors: false,
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
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
  terminal.onResize(({ cols, rows }) => bridge.resize(id, cols, rows));
  terminal.textarea?.addEventListener('focus', () => {
    if (page.focused === terminalIndex) return;
    page.focused = terminalIndex;
    renderStatus();
  });
  return pane;
}

function buildPage(project: Project, slot: number): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const page: Page = { project, element, panes: [], focused: 0, slot };
  // Deliberate insurance against one race: the picker only offers folders that exist, so the sole way here
  // is deleting the folder between the dialog closing and the existence check. Then you get this page
  // instead of a blank one with no shells.
  if (project.missing) {
    element.classList.add('missing');
    element.textContent = `Directory not found: ${project.path}`;
    return page;
  }
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(slot, terminalIndex);
    const pane = buildPane(page, id, terminalIndex);
    page.panes.push(pane);
    panesById.set(id, pane);
  }
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
  task.catch((error: unknown) => {
    statusProjects.textContent = `Failed to open project: ${String(error)}`;
  });
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
    case 'terminal-focus': return focusTerminal(action.index);
    case 'terminal-next': return focusTerminal(page.focused + 1);
    case 'terminal-previous': return focusTerminal(page.focused - 1);
    case 'terminal-move': return focusTerminal(neighbor(page.focused, action.direction));
  }
}

// Capture phase runs before xterm's own key handler, so the shell never sees these keys.
window.addEventListener('keydown', (event) => {
  // The picker owns every key typed inside it. xterm's textarea is outside it, so a pane keeps its shortcuts.
  if (event.target instanceof Element && event.target.closest('.picker')) return;
  const action = mapShortcut(event, isMac);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  apply(action);
}, true);

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
  statusProjects.textContent = `Failed to start: ${String(error)}`;
});
