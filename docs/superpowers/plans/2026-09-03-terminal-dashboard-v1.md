# Terminal Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keyboard-first Electron app that opens a fixed list of projects, gives each one five shells in a fixed grid, and switches between them with shortcuts.

**Architecture:** The Electron main process reads `.env`, spawns one pseudo-terminal per (project, terminal) pair with node-pty, and relays bytes over IPC. The renderer draws one xterm.js instance per pseudo-terminal, one hidden page per project, and intercepts shortcuts in the capture phase before xterm sees them. Pure logic (env parsing, shell choice, shortcut mapping) lives in small files with unit tests.

**Tech Stack:** Electron 44, Electron Forge 7 (vite-typescript template), TypeScript, @xterm/xterm 6, @xterm/addon-fit 0.11, node-pty 1.1, vitest 4. Node 22.

**Spec:** `docs/superpowers/specs/2026-09-03-terminal-dashboard-design.md`

## Global Constraints

- No abbreviations in identifiers (`configuration`, not `config`). Library names keep their own spelling (`pty` in `node-pty`, IPC channel names).
- No source file over 600 lines of code.
- No UI framework. Plain DOM.
- `.env` is gitignored and never committed. `.env.example` is committed.
- Five terminals per project, fixed layout: two on top, three on bottom, equal widths per row.
- Shortcut modifier: Cmd on macOS, Ctrl elsewhere.
- Commit messages: plain, no tool attribution.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/projects.ts` | Parse `PROJECTS` from an env object into `Project[]`, flag missing directories |
| `src/projects.test.ts` | Unit tests for the above |
| `src/shell.ts` | Pick the shell command from env and platform |
| `src/shell.test.ts` | Unit tests for the above |
| `src/shortcuts.ts` | Map a key event to an `Action`. Exports `TERMINAL_COUNT` |
| `src/shortcuts.test.ts` | Unit tests for the above |
| `src/bridge.ts` | The `DashboardBridge` type shared by preload and renderer |
| `src/preload.ts` | Expose the bridge on `window.dashboard` |
| `src/main.ts` | Window, `.env` loading, pseudo-terminal spawning, IPC handlers |
| `src/renderer.ts` | Pages, panes, xterm instances, shortcut dispatch, status bar |
| `src/index.css` | Layout |
| `index.html` | Status bar and pages container |
| `.env.example` | Documented example of the env file |

IPC channels (main ⇄ renderer):

| Channel | Direction | Payload |
|---|---|---|
| `projects:get` | renderer → main (invoke) | returns `Project[]` |
| `pty:input` | renderer → main | `id: string, data: string` |
| `pty:resize` | renderer → main | `id: string, cols: number, rows: number` |
| `pty:restart` | renderer → main | `id: string` |
| `pty:data` | main → renderer | `id: string, data: string` |
| `pty:exit` | main → renderer | `id: string` |

A terminal id is `${projectIndex}:${terminalIndex}`, for example `2:4`.

---

### Task 1: Scaffold the Electron app

**Files:**
- Create: everything the Forge template generates (`package.json`, `forge.config.ts`, `vite.*.config.ts`, `tsconfig.json`, `src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `src/index.css`, `index.html`)
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a runnable `npm start` that opens a window.

- [ ] **Step 1: Scaffold into a temporary directory, then move files in**

The repo already has files, and the Forge initializer refuses a non-empty directory.

```bash
SCRATCH="$(mktemp -d)"
npm init electron-app@latest "$SCRATCH/app" -- --template=vite-typescript
cp -R "$SCRATCH/app"/. /Users/sharp/workspace/personal/dashboard/
cd /Users/sharp/workspace/personal/dashboard
```

The template's `.gitignore` overwrites ours. Re-add our lines:

```bash
printf '\n.env\n.DS_Store\n' >> .gitignore
```

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install @xterm/xterm@6 @xterm/addon-fit@0.11 node-pty@1
npm install --save-dev vitest@4 @types/node@22
```

`node-pty` must be in `dependencies`, not `devDependencies`. The Forge Vite plugin externalizes everything in `dependencies` from the main bundle, which is required for a native module.

- [ ] **Step 3: Add the test script**

In `package.json`, under `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create `.env.example`**

```bash
cat > .env.example <<'EXAMPLE'
# Comma-separated absolute paths. Each becomes one project page.
PROJECTS=/Users/you/code/api,/Users/you/code/web

# Optional. Falls back to $SHELL, then zsh (macOS), bash (Linux), powershell (Windows).
# SHELL_COMMAND=/bin/zsh
EXAMPLE
```

- [ ] **Step 5: Verify the app starts**

Run: `npm start`
Expected: an Electron window opens showing the template's hello page. Close it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Scaffold Electron app with Forge, xterm, node-pty"
```

---

### Task 2: Project list from env

**Files:**
- Create: `src/projects.ts`
- Test: `src/projects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Project = { name: string; path: string; missing: boolean };
  export function parseProjects(
    environment: Record<string, string | undefined>,
    directoryExists?: (path: string) => boolean,
  ): Project[];
  ```

- [ ] **Step 1: Write the failing tests**

`src/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseProjects } from './projects';

const exists = () => true;

describe('parseProjects', () => {
  it('returns an empty list when PROJECTS is unset', () => {
    expect(parseProjects({}, exists)).toEqual([]);
  });

  it('splits on commas and names each project by its last path segment', () => {
    const projects = parseProjects({ PROJECTS: '/code/api,/code/web' }, exists);
    expect(projects.map((project) => project.name)).toEqual(['api', 'web']);
    expect(projects.map((project) => project.path)).toEqual(['/code/api', '/code/web']);
  });

  it('ignores whitespace and empty entries', () => {
    const projects = parseProjects({ PROJECTS: ' /code/api , ,/code/web, ' }, exists);
    expect(projects.map((project) => project.path)).toEqual(['/code/api', '/code/web']);
  });

  it('flags directories that do not exist', () => {
    const projects = parseProjects({ PROJECTS: '/gone,/here' }, (path) => path === '/here');
    expect(projects.map((project) => project.missing)).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `./projects`.

- [ ] **Step 3: Implement**

`src/projects.ts`:

```ts
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

export type Project = { name: string; path: string; missing: boolean };

export function parseProjects(
  environment: Record<string, string | undefined>,
  directoryExists: (path: string) => boolean = existsSync,
): Project[] {
  return (environment.PROJECTS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((path) => ({ name: basename(path), path, missing: !directoryExists(path) }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/projects.ts src/projects.test.ts
git commit -m "Parse project list from env"
```

---

### Task 3: Shell selection

**Files:**
- Create: `src/shell.ts`
- Test: `src/shell.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function pickShell(
    environment: Record<string, string | undefined>,
    platform: string,
  ): string;
  ```

- [ ] **Step 1: Write the failing tests**

`src/shell.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickShell } from './shell';

describe('pickShell', () => {
  it('prefers SHELL_COMMAND', () => {
    expect(pickShell({ SHELL_COMMAND: '/opt/fish', SHELL: '/bin/zsh' }, 'darwin')).toBe('/opt/fish');
  });

  it('falls back to SHELL', () => {
    expect(pickShell({ SHELL: '/bin/zsh' }, 'linux')).toBe('/bin/zsh');
  });

  it('falls back per platform', () => {
    expect(pickShell({}, 'darwin')).toBe('/bin/zsh');
    expect(pickShell({}, 'linux')).toBe('/bin/bash');
    expect(pickShell({}, 'win32')).toBe('powershell.exe');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `./shell`.

- [ ] **Step 3: Implement**

`src/shell.ts`:

```ts
const platformDefault: Record<string, string> = {
  darwin: '/bin/zsh',
  win32: 'powershell.exe',
};

export function pickShell(
  environment: Record<string, string | undefined>,
  platform: string,
): string {
  return (
    environment.SHELL_COMMAND ||
    environment.SHELL ||
    platformDefault[platform] ||
    '/bin/bash'
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shell.ts src/shell.test.ts
git commit -m "Pick shell from env or platform default"
```

---

### Task 4: Shortcut mapping

**Files:**
- Create: `src/shortcuts.ts`
- Test: `src/shortcuts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TERMINAL_COUNT = 5;
  export type Action =
    | { kind: 'project-next' }
    | { kind: 'project-previous' }
    | { kind: 'project-jump'; index: number }
    | { kind: 'terminal-focus'; index: number }
    | { kind: 'terminal-next' }
    | { kind: 'terminal-previous' };
  export type KeyInput = {
    key: string; code: string;
    shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean;
  };
  export function mapShortcut(input: KeyInput, isMac: boolean): Action | null;
  ```
  `KeyInput` is a structural subset of the DOM `KeyboardEvent`, so the renderer passes the event straight in.

- [ ] **Step 1: Write the failing tests**

`src/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapShortcut, type KeyInput } from './shortcuts';

function key(overrides: Partial<KeyInput>): KeyInput {
  return { key: '', code: '', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...overrides };
}

describe('mapShortcut on macOS', () => {
  it('cycles projects with Cmd+] and Cmd+[', () => {
    expect(mapShortcut(key({ key: ']', metaKey: true }), true)).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ key: '[', metaKey: true }), true)).toEqual({ kind: 'project-previous' });
  });

  it('jumps to a project with Cmd+Shift+digit', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '#', metaKey: true, shiftKey: true }), true))
      .toEqual({ kind: 'project-jump', index: 2 });
  });

  it('focuses a terminal with Cmd+1..5 and ignores Cmd+6..9', () => {
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true))
      .toEqual({ kind: 'terminal-focus', index: 0 });
    expect(mapShortcut(key({ code: 'Digit5', key: '5', metaKey: true }), true))
      .toEqual({ kind: 'terminal-focus', index: 4 });
    expect(mapShortcut(key({ code: 'Digit6', key: '6', metaKey: true }), true)).toBeNull();
  });

  it('cycles terminals with Cmd+Right and Cmd+Left', () => {
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true }), true)).toEqual({ kind: 'terminal-next' });
    expect(mapShortcut(key({ key: 'ArrowLeft', metaKey: true }), true)).toEqual({ kind: 'terminal-previous' });
  });

  it('lets Ctrl through to the shell on macOS', () => {
    expect(mapShortcut(key({ key: 'c', ctrlKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: ']', ctrlKey: true }), true)).toBeNull();
  });

  it('ignores plain keys and Alt combinations', () => {
    expect(mapShortcut(key({ key: ']' }), true)).toBeNull();
    expect(mapShortcut(key({ key: ']', metaKey: true, altKey: true }), true)).toBeNull();
  });
});

describe('mapShortcut elsewhere', () => {
  it('uses Ctrl as the modifier', () => {
    expect(mapShortcut(key({ key: ']', ctrlKey: true }), false)).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ key: ']', metaKey: true }), false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `./shortcuts`.

- [ ] **Step 3: Implement**

`src/shortcuts.ts`:

```ts
export const TERMINAL_COUNT = 5;

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' };

export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

export function mapShortcut(input: KeyInput, isMac: boolean): Action | null {
  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (!modifier || input.altKey) return null;

  // Digits use `code` because Shift changes `key` ("1" becomes "!").
  const digit = /^Digit([1-9])$/.exec(input.code);
  if (digit) {
    const index = Number(digit[1]) - 1;
    if (input.shiftKey) return { kind: 'project-jump', index };
    return index < TERMINAL_COUNT ? { kind: 'terminal-focus', index } : null;
  }

  if (input.shiftKey) return null;
  switch (input.key) {
    case ']': return { kind: 'project-next' };
    case '[': return { kind: 'project-previous' };
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    default: return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shortcuts.ts src/shortcuts.test.ts
git commit -m "Map key events to project and terminal actions"
```

---

### Task 5: Main process and preload bridge

**Files:**
- Create: `src/bridge.ts`
- Modify: `src/preload.ts` (replace template content)
- Modify: `src/main.ts` (replace template content)

**Interfaces:**
- Consumes: `parseProjects`, `Project` (Task 2), `pickShell` (Task 3), `TERMINAL_COUNT` (Task 4).
- Produces: `window.dashboard: DashboardBridge` in the renderer, and the IPC channels listed in File Structure.

- [ ] **Step 1: Define the bridge type**

`src/bridge.ts`:

```ts
import type { Project } from './projects';

export type DashboardBridge = {
  platform: string;
  getProjects(): Promise<Project[]>;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string) => void): void;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
```

- [ ] **Step 2: Write the preload**

`src/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { DashboardBridge } from './bridge';

const bridge: DashboardBridge = {
  platform: process.platform,
  getProjects: () => ipcRenderer.invoke('projects:get'),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id) => listener(id)),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
```

- [ ] **Step 3: Write the main process**

`src/main.ts`. Keep the template's `createWindow` body if it differs in window-loading details (the `MAIN_WINDOW_VITE_*` globals), but the window must be assigned to the module-level `mainWindow` variable.

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as pty from 'node-pty';
import started from 'electron-squirrel-startup';
import { parseProjects } from './projects';
import { pickShell } from './shell';
import { TERMINAL_COUNT } from './shortcuts';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) app.quit();

const environmentFile = path.join(app.getAppPath(), '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const projects = parseProjects(process.env);
const shellCommand = pickShell(process.env, process.platform);
const shells = new Map<string, pty.IPty>();
let mainWindow: BrowserWindow;

function terminalId(projectIndex: number, terminalIndex: number): string {
  return `${projectIndex}:${terminalIndex}`;
}

function spawnShell(id: string): void {
  const projectIndex = Number(id.split(':')[0]);
  const shellProcess = pty.spawn(shellCommand, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: projects[projectIndex].path,
    env: process.env as Record<string, string>,
  });
  shellProcess.onData((data) => mainWindow.webContents.send('pty:data', id, data));
  shellProcess.onExit(() => {
    shells.delete(id);
    mainWindow.webContents.send('pty:exit', id);
  });
  shells.set(id, shellProcess);
}

function spawnAllShells(): void {
  projects.forEach((project, projectIndex) => {
    if (project.missing) return;
    for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
      spawnShell(terminalId(projectIndex, terminalIndex));
    }
  });
}

ipcMain.handle('projects:get', () => {
  if (shells.size === 0) spawnAllShells();
  return projects;
});
ipcMain.on('pty:input', (_event, id: string, data: string) => shells.get(id)?.write(data));
ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => shells.get(id)?.resize(cols, rows));
ipcMain.on('pty:restart', (_event, id: string) => {
  if (!shells.has(id)) spawnShell(id);
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.on('ready', createWindow);
app.on('will-quit', () => {
  for (const shellProcess of shells.values()) shellProcess.kill();
});
app.on('window-all-closed', () => app.quit());
```

Notes for the implementer:
- `process.loadEnvFile` is Node 22 standard library. No dotenv dependency.
- In development `app.getAppPath()` is the repository root, so `.env` at the root is found. Packaging is out of scope for v1.
- The `shells.size === 0` guard makes a renderer reload (Cmd+R in development) reuse running shells instead of spawning a second set.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `process.loadEnvFile` is unknown, confirm `@types/node@22` is installed.

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts src/preload.ts src/main.ts
git commit -m "Spawn shells in main process and expose IPC bridge"
```

---

### Task 6: Renderer, layout, and manual verification

**Files:**
- Modify: `index.html` (replace template content)
- Modify: `src/index.css` (replace template content)
- Modify: `src/renderer.ts` (replace template content)

**Interfaces:**
- Consumes: `window.dashboard` (Task 5), `mapShortcut`, `TERMINAL_COUNT`, `Action` (Task 4), `Project` type (Task 2).

- [ ] **Step 1: Write the HTML**

`index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Dashboard</title>
  </head>
  <body>
    <header id="status"></header>
    <main id="pages"></main>
    <script type="module" src="/src/renderer.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the CSS**

`src/index.css`:

```css
html, body {
  height: 100%;
  margin: 0;
  background: #1e1e1e;
  color: #cccccc;
  font: 12px Menlo, Monaco, monospace;
}

body {
  display: flex;
  flex-direction: column;
}

#status {
  padding: 4px 8px;
  background: #2d2d2d;
  white-space: pre;
  user-select: none;
}

#pages {
  flex: 1;
  min-height: 0;
}

.page {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  background: #444444;
}

.page[hidden] {
  display: none;
}

.page.missing {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff6666;
  background: #1e1e1e;
}

.pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #1e1e1e;
  padding: 4px;
}

.pane:focus-within {
  outline: 1px solid #4a9eff;
  outline-offset: -1px;
}

/* Two on top, three on bottom. Six columns divide evenly into both. */
.pane:nth-child(-n + 2) { grid-column: span 3; }
.pane:nth-child(n + 3) { grid-column: span 2; }

.pane .xterm {
  height: 100%;
}
```

- [ ] **Step 3: Write the renderer**

`src/renderer.ts`:

```ts
import '@xterm/xterm/css/xterm.css';
import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { mapShortcut, TERMINAL_COUNT, type Action } from './shortcuts';
import type { Project } from './projects';

type Pane = { id: string; terminal: Terminal; fit: FitAddon; exited: boolean };
type Page = { project: Project; element: HTMLElement; panes: Pane[]; focused: number };

const bridge = window.dashboard;
const isMac = bridge.platform === 'darwin';
const statusElement = document.getElementById('status') as HTMLElement;
const pagesElement = document.getElementById('pages') as HTMLElement;
const pages: Page[] = [];
const panesById = new Map<string, Pane>();
let activeIndex = 0;

function renderStatus(): void {
  const page = pages[activeIndex];
  const names = pages
    .map((entry, index) => (index === activeIndex ? `[${entry.project.name}]` : entry.project.name))
    .join('  ');
  const terminal = page.panes.length > 0 ? `   terminal ${page.focused + 1}` : '';
  statusElement.textContent = names + terminal;
}

function focusTerminal(index: number): void {
  const page = pages[activeIndex];
  if (page.panes.length === 0) return;
  page.focused = (index + TERMINAL_COUNT) % TERMINAL_COUNT;
  page.panes[page.focused].terminal.focus();
  renderStatus();
}

function showPage(index: number): void {
  activeIndex = (index + pages.length) % pages.length;
  pages.forEach((page, pageIndex) => {
    page.element.hidden = pageIndex !== activeIndex;
  });
  for (const pane of pages[activeIndex].panes) pane.fit.fit();
  focusTerminal(pages[activeIndex].focused);
  renderStatus();
}

function buildPane(page: Page, id: string, terminalIndex: number): Pane {
  const container = document.createElement('div');
  container.className = 'pane';
  page.element.append(container);

  const terminal = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Monaco, monospace' });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);

  const pane: Pane = { id, terminal, fit, exited: false };
  terminal.onData((data) => {
    if (!pane.exited) {
      bridge.sendInput(id, data);
      return;
    }
    if (data === '\r') {
      pane.exited = false;
      terminal.reset();
      bridge.restart(id);
      fit.fit();
    }
  });
  terminal.onResize(({ cols, rows }) => bridge.resize(id, cols, rows));
  terminal.textarea?.addEventListener('focus', () => {
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
    const id = `${projectIndex}:${terminalIndex}`;
    const pane = buildPane(page, id, terminalIndex);
    page.panes.push(pane);
    panesById.set(id, pane);
  }
  return page;
}

function apply(action: Action): void {
  const page = pages[activeIndex];
  switch (action.kind) {
    case 'project-next': return showPage(activeIndex + 1);
    case 'project-previous': return showPage(activeIndex - 1);
    case 'project-jump': return action.index < pages.length ? showPage(action.index) : undefined;
    case 'terminal-focus': return focusTerminal(action.index);
    case 'terminal-next': return focusTerminal(page.focused + 1);
    case 'terminal-previous': return focusTerminal(page.focused - 1);
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

window.addEventListener('resize', () => {
  for (const pane of pages[activeIndex]?.panes ?? []) pane.fit.fit();
});

bridge.onData((id, data) => panesById.get(id)?.terminal.write(data));
bridge.onExit((id) => {
  const pane = panesById.get(id);
  if (!pane) return;
  pane.exited = true;
  pane.terminal.write('\r\n[exited] press Enter to restart\r\n');
});

async function start(): Promise<void> {
  const projects = await bridge.getProjects();
  if (projects.length === 0) {
    pagesElement.textContent = 'No projects. Copy .env.example to .env and set PROJECTS.';
    return;
  }
  projects.forEach((project, projectIndex) => {
    const page = buildPage(project, projectIndex);
    pages.push(page);
    pagesElement.append(page.element);
  });
  showPage(0);
}

start();
```

The `onData` and `onExit` listeners are registered before `getProjects` is awaited, so no shell output is lost between spawn and first render.

- [ ] **Step 4: Type-check and run the unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, 14 passed.

- [ ] **Step 5: Manual verification**

Create `.env` with three projects, one of them a path that does not exist:

```bash
cp .env.example .env
# edit PROJECTS to two real directories and one fake one
npm start
```

Check each of these:

1. Window opens on the first project with five terminals, two on top and three on bottom, all showing a shell prompt in that project's directory (`pwd` in each).
2. Status bar shows all project names with the active one in brackets and the focused terminal number.
3. Cmd+] and Cmd+[ cycle projects, wrapping at both ends. Cmd+Shift+2 jumps to the second project.
4. Cmd+1 to Cmd+5 focus terminals. Cmd+Right and Cmd+Left cycle, wrapping. The focused pane has a blue outline.
5. Clicking a terminal focuses it and updates the status bar.
6. Ctrl+C in a terminal interrupts the shell command, it does not trigger a shortcut.
7. Type `exit` in a terminal. It shows the exited message. Press Enter, a fresh shell appears in the same directory.
8. The fake project page shows "Directory not found" and no terminals. Shortcuts still switch away from it.
9. Resize the window. Terminals refit, no clipped text.
10. Quit the app. `ps aux | grep zsh` shows no leftover shells from the app.

Record any failure and fix it before committing. Likely first-run issues and their fixes:
- Terminals render blank on pages that were hidden at open time: call `pane.terminal.refresh(0, pane.terminal.rows - 1)` after `fit.fit()` in `showPage`.
- `node-pty` fails to load with a NODE_MODULE_VERSION error: run `npx electron-rebuild -f -w node-pty`.

- [ ] **Step 6: Commit**

```bash
git add index.html src/index.css src/renderer.ts
git commit -m "Render project pages with five-terminal grid and shortcuts"
```

---

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# dashboard

Keyboard-first terminal dashboard. Each project gets a page with five shells in a fixed grid.

## Setup

    cp .env.example .env   # set PROJECTS to your directories
    npm install
    npm start

## Shortcuts

Mod is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Next / previous project | Mod+] / Mod+[ |
| Jump to project N | Mod+Shift+1..9 |
| Focus terminal N | Mod+1..5 |
| Next / previous terminal | Mod+Right / Mod+Left |

## Tests

    npm test
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document setup and shortcuts"
```
