import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
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
import { pickShell } from './shell';
import { THEME, TITLE_BAR_HEIGHT } from './theme';
import { TERMINAL_COUNT, terminalId } from './terminals';

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
const terminalDirectories = new Map<string, string>();
let mainWindow: BrowserWindow;

function sendToRenderer(channel: string, ...payload: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...payload);
}

function spawnShell(id: string, directory: string): void {
  const shellProcess = pty.spawn(shellCommand, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: directory,
    env: process.env as Record<string, string>,
  });
  shellProcess.onData((data) => sendToRenderer('pty:data', id, data));
  shellProcess.onExit(({ exitCode }) => {
    shells.delete(id);
    sendToRenderer('pty:exit', id, exitCode);
  });
  shells.set(id, shellProcess);
}

function spawnProject(project: Project, projectIndex: number): void {
  if (project.missing) return;
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(projectIndex, terminalIndex);
    terminalDirectories.set(id, project.path);
    spawnShell(id, project.path);
  }
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
ipcMain.on('pty:input', (_event, id: string, data: string) => shells.get(id)?.write(data));
ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => shells.get(id)?.resize(cols, rows));
ipcMain.on('pty:restart', (_event, id: string) => {
  const directory = terminalDirectories.get(id);
  if (directory !== undefined && !shells.has(id)) spawnShell(id, directory);
});

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
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: { x: 13, y: (TITLE_BAR_HEIGHT - 16) / 2 },
    }),
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
