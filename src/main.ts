import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as pty from 'node-pty';
import started from 'electron-squirrel-startup';
import {
  projectFromPath,
  readRecentPaths,
  rememberRecentPath,
  replacesProject,
  type Project,
} from './projects';
import { isOpenableLink } from './links';
import { pickShell, SHELL_COMMAND_FLAG } from './shell';
import { THEME, TITLE_BAR_HEIGHT } from './theme';
import { TERMINAL_COUNT, terminalId } from './terminals';
import { readBoard, seedBoardDirectory, writeBoard } from './board-store';
import type { Board } from './board';

if (started) app.quit();

// Packaged apps cannot ship a per-user .env inside the bundle, so read it from the home config directory.
const environmentFile = app.isPackaged
  ? path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'dashboard', '.env')
  : path.join(app.getAppPath(), '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

// Empty at launch: every project comes from the picker, and the recents list remembers them across runs.
const projects: Project[] = [];
// The recently opened projects live next to the app's other per-user state.
const recentsFile = path.join(app.getPath('userData'), 'recents.json');
const shellCommand = pickShell(process.env, process.platform);
const shells = new Map<string, pty.IPty>();
// What each terminal id runs and where. The nvim pane is registered here like any other, which is
// what lets the renderer start it later through the ordinary restart path.
const terminalCommands = new Map<string, { command: string; directory: string }>();
let mainWindow: BrowserWindow;

function sendToRenderer(channel: string, ...payload: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...payload);
}

function spawnTerminal(id: string): void {
  const entry = terminalCommands.get(id);
  if (entry === undefined) return;
  let terminalProcess: pty.IPty;
  try {
    terminalProcess = pty.spawn(entry.command, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: entry.directory,
      env: process.env as Record<string, string>,
    });
  } catch {
    // nvim may simply not be installed. The pane shows the same exit line a dead shell shows,
    // rather than the spawn taking the window down.
    sendToRenderer('pty:exit', id, 127);
    return;
  }
  terminalProcess.onData((data) => sendToRenderer('pty:data', id, data));
  terminalProcess.onExit(({ exitCode }) => {
    shells.delete(id);
    sendToRenderer('pty:exit', id, exitCode);
  });
  shells.set(id, terminalProcess);
}

// The five shells start with the project. The editor is registered but not started: opening nine
// projects should not launch nine editors, each with its own swap files, that you never asked for.
function spawnProject(project: Project, projectIndex: number): void {
  if (project.missing) return;
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(projectIndex, terminalIndex);
    terminalCommands.set(id, { command: shellCommand, directory: project.path });
    spawnTerminal(id);
  }
  terminalCommands.set(terminalId(projectIndex, TERMINAL_COUNT), { command: 'nvim', directory: project.path });
}

// Directories that have gone away are dropped rather than offered, so the list only holds openable projects.
ipcMain.handle('projects:recent', () =>
  readRecentPaths(recentsFile).map((entry) => projectFromPath(entry)).filter((project) => !project.missing));
// A null path opens the folder dialog; a path from the picker skips it.
ipcMain.handle('projects:open', async (_event, projectPath: string | null) => {
  if (projectPath === null) {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) return null;
    projectPath = filePaths[0];
  }
  const picked = projectFromPath(projectPath);
  const matchIndex = projects.findIndex((project) => project.path === picked.path);
  const index = matchIndex === -1 ? projects.length : matchIndex;
  const replaced = replacesProject(projects[index], picked);
  if (replaced) {
    projects[index] = picked;
    spawnProject(picked, index);
  }
  // rememberRecentPath swallows its own failures: the shells are already running, so losing the history
  // entry must not fail the open and strand them on a slot the renderer has no page for.
  if (!picked.missing) rememberRecentPath(recentsFile, picked.path);
  return { index, project: projects[index], replaced };
});
ipcMain.on('link:open', (_event, url: string) => {
  if (isOpenableLink(url)) shell.openExternal(url);
});
ipcMain.on('pty:input', (_event, id: string, data: string) => shells.get(id)?.write(data));
ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => shells.get(id)?.resize(cols, rows));
ipcMain.on('pty:restart', (_event, id: string) => {
  if (!shells.has(id)) spawnTerminal(id);
});
// Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard.
ipcMain.handle('board:read', (_event, projectPath: string) => {
  seedBoardDirectory(projectPath);
  return readBoard(projectPath);
});
// invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
ipcMain.handle('board:write', (_event, projectPath: string, board: Board) => writeBoard(projectPath, board));

function createWindow(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
  ]));
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: THEME.background,
    // The renderer draws its own title row, so the window chrome is dark all the way up, the way Ghostty
    // looks. macOS keeps its traffic lights over that row; their frame is 16px tall, so this centres them.
    // Windows and Linux draw no buttons once the title bar is hidden, so they keep the system one.
    // The 13px inset here is what the 80px padding in the `.mac #title` rule of index.css clears; move
    // one and the title text either overlaps the lights or floats away from them.
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: { x: 13, y: (TITLE_BAR_HEIGHT - 16) / 2 },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`${SHELL_COMMAND_FLAG}${shellCommand}`],
    },
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
