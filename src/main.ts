import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron';
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
import { editorArguments, pickShell } from './shell';
import { TITLE_BAR_HEIGHT } from './theme';
import { EDITOR_INDEX, TERMINAL_COUNT, terminalId } from './terminals';
import { readBoard, seedBoardDirectory, writeBoard } from './board-store';
import { readSession, writeSession, type Session } from './session';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings-store';
import type { Settings } from './settings';
import type { Board } from './board';

if (started) app.quit();

// Packaged apps cannot ship a per-user .env inside the bundle, so read it from the home config directory.
const environmentFile = app.isPackaged
  ? path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'dashboard', '.env')
  : path.join(app.getAppPath(), '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

// Empty at launch: every project comes from the picker, and the recents list remembers them across runs.
const projects: Project[] = [];
// The recently opened projects live next to the app's other per-user state, and so does the layout the
// last run was left in.
const recentsFile = path.join(app.getPath('userData'), 'recents.json');
const sessionFile = path.join(app.getPath('userData'), 'session.json');
const settingsFile = settingsFilePath(app.getPath('home'), process.env.XDG_CONFIG_HOME);
// Read before the window exists: the background colour paints the first frame, and the shell command
// spawns the first pane. Both are needed before the renderer has run a line.
const isMac = process.platform === 'darwin';
let settings = readSettings(settingsFile, isMac);
// A file an older build wrote spelled out every shipped key and colour as if they had been chosen, and
// nothing strips those lines until the settings screen is next opened. Tidying it once here drops
// everything that still matches this build, so the next default to move reaches these people. It cannot
// give back a default that has already moved: a line the old build wrote is identical to one typed on
// purpose. What the file holds and what survives is tidySettingsFile's to say, not this line's.
tidySettingsFile(settingsFile, isMac);
let shellCommand = pickShell(settings, process.env, process.platform);
const shells = new Map<string, pty.IPty>();
// What each terminal id runs and where. Every pane is the same shell and differs only in what it is
// asked to run: nothing for the five terminals, nvim for the editor. The editor is registered here like
// any other, which is what lets the renderer start it later through the ordinary restart path.
// The editor's args are the literal string 'editor' rather than a precomputed array: they depend on the
// shell in force, and a project can sit open for a long time before its nvim key is ever pressed. Baking
// editorArguments(shellCommand) in here would freeze it at the shell the project opened with — change
// the shell afterwards and a project already open would still launch nvim through the old one.
const terminalCommands = new Map<string, { args: string[] | 'editor'; directory: string }>();
let mainWindow: BrowserWindow;
// True while the quit question is on screen. Every close is stopped, so without it holding Cmd+Q
// stacks a question per keypress and you answer the same one five times.
let askingToQuit = false;

function sendToRenderer(channel: string, ...payload: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...payload);
}

function spawnTerminal(id: string): void {
  const entry = terminalCommands.get(id);
  if (entry === undefined) return;
  const args = entry.args === 'editor' ? editorArguments(shellCommand) : entry.args;
  let terminalProcess: pty.IPty;
  try {
    terminalProcess = pty.spawn(shellCommand, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: entry.directory,
      env: process.env as Record<string, string>,
    });
  } catch {
    // The shell itself may be missing — a stale SHELL_COMMAND, say. The pane shows the same exit line
    // a dead shell shows, rather than the spawn taking the window down. A missing nvim is not this case:
    // the shell starts, fails to find it, and exits 127 on its own.
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
    terminalCommands.set(id, { args: [], directory: project.path });
    spawnTerminal(id);
  }
  terminalCommands.set(terminalId(projectIndex, EDITOR_INDEX), { args: 'editor', directory: project.path });
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
// Read once at startup and written back whenever the layout changes, so a crash loses at most the
// change you were making rather than every project you had open.
ipcMain.handle('session:read', () => readSession(sessionFile));
ipcMain.on('session:write', (_event, session: Session) => writeSession(sessionFile, session));
// The resolved shell travels with the settings, because the renderer needs to know which family of
// shell will receive a dropped path — PowerShell doubles a quote and a POSIX shell escapes it — and
// `shellCommand: ""` in the file does not say which.
ipcMain.handle('settings:read', () => ({ settings, shellCommand }));
// Answers with the newly resolved shell so the renderer never has to re-derive pickShell's precedence
// to know which family of shell a dropped path is quoted for.
ipcMain.handle('settings:write', (_event, next: Settings) => {
  settings = next;
  // Panes already running keep the shell they started with. Nothing here kills one: there are
  // long-running jobs in them, and a settings change is not a reason to lose one.
  shellCommand = pickShell(settings, process.env, process.platform);
  writeSettings(settingsFile, settings, isMac);
  return shellCommand;
});
// Clicking the banner is the answer to it: the app comes forward, and the renderer is told which pane
// to land on. Without that half you arrive at whatever project you were last on and go looking for the
// pane the banner had already named.
ipcMain.on('notification:show', (_event, title: string, body: string, paneId: string) => {
  const notification = new Notification({ title, body });
  notification.on('click', () => {
    // Landing on the pane is no use behind a window that is not on screen. macOS activates the app
    // for a click but leaves a minimized window in the Dock, and on Windows and Linux nothing
    // activates it at all, so ask for the window every time. show() is the hidden-to-shown
    // transition; coming back from the Dock is restore()'s, so both are needed.
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    sendToRenderer('notification:click', paneId);
  });
  notification.show();
});

ipcMain.on('link:open', (_event, url: string) => {
  if (isOpenableLink(url)) shell.openExternal(url);
});
ipcMain.on('pty:input', (_event, id: string, data: string) => shells.get(id)?.write(data));
ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => shells.get(id)?.resize(cols, rows));
ipcMain.on('pty:restart', (_event, id: string) => {
  if (!shells.has(id)) spawnTerminal(id);
});
// Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
// is a convenience — writing the two explanation files — so a read-only project folder must not cost
// the user a board.json that is sitting right there and perfectly readable.
ipcMain.handle('board:read', (_event, projectPath: string) => {
  try {
    seedBoardDirectory(projectPath);
  } catch {
    // No explanation files this time.
  }
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
    backgroundColor: settings.theme.background,
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
    },
  });
  // Closing the window kills every shell on every page, and there is no getting a long-running task
  // back. Cancel is the default button, so Enter and Escape both mean "I hit that by accident".
  // Asked without blocking: showMessageBoxSync stops the whole main process, so anything already
  // waiting there — a folder panel, a board write — can never finish while the question is up. The
  // close is stopped every time; destroy() is what actually goes, and it raises no close to answer.
  mainWindow.on('close', (event) => {
    event.preventDefault();
    if (askingToQuit) return;
    askingToQuit = true;
    void dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      message: 'Quit Dashboard?',
      detail: 'Every shell in every open project is killed, including anything still running in one.',
    }).then(({ response }) => {
      if (response === 1) mainWindow.destroy();
    }).finally(() => {
      // Reset on the rejection path too. Leave it true after a failed dialog and every later close
      // is cancelled before it asks anything: the window can only be shut by Force Quit, which is
      // the one exit that kills the shells without asking.
      askingToQuit = false;
    });
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
