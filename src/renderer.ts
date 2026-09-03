import '@xterm/xterm/css/xterm.css';
import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { mapShortcut, type Action } from './shortcuts';
import { TERMINAL_COUNT, neighbor, terminalId } from './terminals';
import type { Project } from './projects';

type Pane = { terminal: Terminal; fit: FitAddon; exited: boolean };
type Page = { project: Project; element: HTMLElement; panes: Pane[]; focused: number };

const bridge = window.dashboard;
const isMac = bridge.platform === 'darwin';
const statusElement = document.getElementById('status') as HTMLElement;
const pagesElement = document.getElementById('pages') as HTMLElement;
const pages: Page[] = [];
const panesById = new Map<string, Pane>();
let activeIndex = 0;

function renderStatus(): void {
  if (pages.length === 0) {
    statusElement.textContent = 'Ctrl+S opens a project';
    return;
  }
  const page = pages[activeIndex];
  const names = pages
    .map((entry, index) => (index === activeIndex ? `[${entry.project.name}]` : entry.project.name))
    .join('  ');
  const terminal = page.panes.length > 0 ? `   terminal ${page.focused + 1}` : '';
  statusElement.textContent = names + terminal;
}

function focusTerminal(index: number): void {
  const page = pages[activeIndex];
  if (page.panes.length > 0) {
    page.focused = (index + TERMINAL_COUNT) % TERMINAL_COUNT;
    page.panes[page.focused].terminal.focus();
  }
  renderStatus();
}

// Hidden pages keep their layout (visibility, not display), so every pane can be fit.
function fitAllPages(): void {
  for (const page of pages) for (const pane of page.panes) pane.fit.fit();
}

function showPage(index: number): void {
  if (pages.length === 0) return renderStatus();
  activeIndex = (index + pages.length) % pages.length;
  pages.forEach((page, pageIndex) => {
    page.element.hidden = pageIndex !== activeIndex;
  });
  focusTerminal(pages[activeIndex].focused);
}

function buildPane(page: Page, id: string, terminalIndex: number): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  page.element.append(container);

  const terminal = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Monaco, monospace' });
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

function buildPage(project: Project, projectIndex: number): Page {
  const element = document.createElement('section');
  element.className = 'page';
  const page: Page = { project, element, panes: [], focused: 0 };
  if (project.missing) {
    element.classList.add('missing');
    element.textContent = `Directory not found: ${project.path}`;
    return page;
  }
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(projectIndex, terminalIndex);
    const pane = buildPane(page, id, terminalIndex);
    page.panes.push(pane);
    panesById.set(id, pane);
  }
  return page;
}

function addPage(project: Project, projectIndex: number): void {
  const page = buildPage(project, projectIndex);
  pages.push(page);
  pagesElement.append(page.element);
}

// Pages mirror the main process's project list one-to-one, so a new index is always the next slot.
async function pickProject(): Promise<void> {
  const picked = await bridge.pickProject();
  if (!picked) return;
  if (picked.index === pages.length) {
    addPage(picked.project, picked.index);
    fitAllPages();
  }
  showPage(picked.index);
}

function apply(action: Action): void {
  if (action.kind === 'project-pick') return void pickProject();
  if (pages.length === 0) return;
  const page = pages[activeIndex];
  switch (action.kind) {
    case 'project-next': return showPage(activeIndex + 1);
    case 'project-previous': return showPage(activeIndex - 1);
    case 'project-jump':
      if (action.index < pages.length) showPage(action.index);
      return;
    case 'terminal-focus': return focusTerminal(action.index);
    case 'terminal-next': return focusTerminal(page.focused + 1);
    case 'terminal-previous': return focusTerminal(page.focused - 1);
    case 'terminal-move': return focusTerminal(neighbor(page.focused, action.direction));
  }
}

// Capture phase runs before xterm's own key handler, so the shell never sees these keys.
window.addEventListener('keydown', (event) => {
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

async function start(): Promise<void> {
  const projects = await bridge.getProjects();
  projects.forEach(addPage);
  fitAllPages();
  showPage(0);
}

start().catch((error: unknown) => {
  statusElement.textContent = `Failed to start: ${String(error)}`;
});
