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
