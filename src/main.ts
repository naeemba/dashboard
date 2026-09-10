import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
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
import { agentArguments, editorArguments, pickShell } from './shell';
import { TITLE_BAR_HEIGHT } from './theme';
import { EDITOR_INDEX, TERMINAL_COUNT, terminalId } from './terminals';
import { readBoard, seedBoardDirectory, writeBoard } from './board-store';
import { readSession, writeSession, type Session } from './session';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings-store';
import { BOARD_FILE_PATH, blockingChanges, branchNameFor, freePane, worktreePathFor } from './ship';
import {
  entryForCard,
  livingEntries,
  readWorktrees,
  withEntry,
  withoutWorktree,
  writeWorktrees,
  type WorktreeEntry,
} from './worktree-store';
import type { Settings } from './settings';
import { moveCardToColumn, selectionOf, shipColumnIndex, type Board } from './board';
import type { ShipRequest, ShipResult } from './bridge';

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
const worktreesFile = path.join(app.getPath('userData'), 'worktrees.json');
// Dropped on read, so a worktree removed by hand outside the app does not leave its card marked as in
// flight forever with nothing able to clear it.
//
// Every pane comes back null with it. No shell outlives the app, so nothing this file says was in
// pane 2 is in pane 2 a moment after launch: that pane is a plain shell in the project, and a record
// still naming it would put a branch name under the status bar of a checkout the pane is not in —
// which is the wrong-checkout mistake the branch is printed there to prevent. Clearing it also gives
// the worktree back: a card with no pane is the one ship that is allowed to run again, and shipping
// it hands the folder that is already there to a pane. Written out, so the file says what this says.
let worktrees: WorktreeEntry[] = livingEntries(readWorktrees(worktreesFile), existsSync)
  .map((entry) => ({ ...entry, pane: null }));
writeWorktrees(worktreesFile, worktrees);
// Which panes you have typed into. The only signal there is about a pane being free: main sees every
// keystroke sent to a pty and nothing at all about what is running in one.
const typedPanes = new Set<string>();
// The cards whose ship is running right now. Two ships of one card both get past the already-shipped
// check before either has recorded anything, and the second record replaces the first: two branches
// and two folders on disk, and the one nothing points at can neither be seen nor removed from inside
// the app.
const shippingCards = new Set<string>();
const runCommand = promisify(execFile);
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

// A pane whose agent has exited. It goes back to being an ordinary pane: a plain shell, still in the
// worktree, because that is where the work is. Left alone, Enter would start the agent over instead
// of giving you a prompt, and the pane would stay counted as in use with nothing running in it.
// Whether a pane was an agent's is the worktrees record's to say — the pane is pointed at one of its
// folders — rather than a second list kept alongside it.
function releaseAgentPane(id: string): void {
  const entry = terminalCommands.get(id);
  if (entry === undefined) return;
  if (!worktrees.some((worktree) => worktree.worktreePath === entry.directory)) return;
  typedPanes.delete(id);
  terminalCommands.set(id, { args: [], directory: entry.directory });
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
    // Only when this is still the pane's shell. A ship kills the shell in the pane it takes and starts
    // the agent in the same tick, and the killed shell's exit arrives after that: without the check it
    // would drop the agent out of the map, leaving nothing for your keystrokes to reach, and tell the
    // renderer a pane that is busy working had died.
    if (shells.get(id) !== terminalProcess) return;
    shells.delete(id);
    releaseAgentPane(id);
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
    // A brand new shell in this slot, so nobody has typed into it — even if someone typed into the
    // project that used to be here. Left set, opening a fresh project into a slot you had worked in
    // would tell the next ship every pane was in use.
    typedPanes.delete(id);
    terminalCommands.set(id, { args: [], directory: project.path });
    spawnTerminal(id);
  }
  terminalCommands.set(terminalId(projectIndex, EDITOR_INDEX), { args: 'editor', directory: project.path });
}

// Point a pane at a worktree and start the agent in it. The pane keeps its id — it is still terminal
// 3 of that project — and only what it runs and where changes, which is exactly what terminalCommands
// exists to say. The old shell is killed first: retargeting a pane that is still running one would
// leave two processes writing to the same id.
function startAgent(id: string, worktreePath: string, cardId: string): void {
  terminalCommands.set(id, {
    args: agentArguments(shellCommand, `/work-card ${cardId}`),
    directory: worktreePath,
  });
  // Counted as used from here on. A pane with an agent working in it is the last one a second ship
  // should take, and nobody typing in it is exactly why it would otherwise still look free.
  typedPanes.add(id);
  shells.get(id)?.kill();
  shells.delete(id);
  spawnTerminal(id);
}

// execFile, never a shell, so a card titled with a quote in it cannot become a command. Awaited
// rather than sync: main is the process every pane's bytes flow through, and a fetch on a slow
// network would otherwise stop all five shells painting until it returned.
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await runCommand('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

// origin/HEAD, then main, then master. The same three-step guess create-task.js makes, and for the
// same reason: origin/HEAD is not set in every clone.
async function baseBranch(projectPath: string): Promise<string> {
  try {
    const head = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], projectPath);
    return head.replace(/^origin\//, '');
  } catch {
    // Not set in this clone; try the usual names.
  }
  for (const candidate of ['main', 'master']) {
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${candidate}`], projectPath);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error('cannot tell which branch on origin is the main one');
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
ipcMain.on('pty:input', (_event, id: string, data: string) => {
  typedPanes.add(id);
  shells.get(id)?.write(data);
});
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

function recordWorktree(entry: WorktreeEntry): WorktreeEntry {
  worktrees = withEntry(worktrees, entry);
  writeWorktrees(worktreesFile, worktrees);
  return entry;
}

// Give the worktree a pane, if there is one going. Split out because it is also the whole of a second
// ship of a card whose worktree exists but never got one.
function attachPane(entry: WorktreeEntry, slot: number): ShipResult {
  const typedIn = Array.from({ length: TERMINAL_COUNT }, (_value, index) => index)
    .filter((index) => typedPanes.has(terminalId(slot, index)));
  const pane = freePane(typedIn, TERMINAL_COUNT);
  if (pane === null) {
    return {
      ok: false,
      message: `every pane in ${path.basename(entry.projectPath)} is in use — free one and ship again`,
    };
  }
  startAgent(terminalId(slot, pane), entry.worktreePath, entry.cardId);
  return { ok: true, entry: recordWorktree({ ...entry, pane }) };
}

// The whole ship, in the order the design doc sets out. Each step's failure stops the flow and comes
// back as a message the board's status bar prints; everything before it is left as it was.
ipcMain.handle('worktree:create', async (_event, request: ShipRequest): Promise<ShipResult> => {
  const { projectPath, cardId, title, slot } = request;
  worktrees = livingEntries(worktrees, existsSync);

  // Already shipped. A record with a pane on it means an agent is working, and a second worktree for
  // the same card is the mistake the record exists to catch. One with no pane is a ship that ran out
  // of panes, and finishing it is the one re-ship that is allowed.
  const existing = entryForCard(worktrees, cardId);
  if (existing) {
    if (existing.pane !== null) {
      return { ok: false, message: `"${title}" is already shipped on ${existing.branch}` };
    }
    return attachPane(existing, slot);
  }

  if (shippingCards.has(cardId)) return { ok: false, message: `"${title}" is already being shipped` };
  shippingCards.add(cardId);
  try {
    const dirty = blockingChanges(await git(['status', '--porcelain'], projectPath));
    if (dirty.length > 0) {
      const count = `${dirty.length} file${dirty.length === 1 ? '' : 's'}`;
      return { ok: false, message: `${count} uncommitted — commit or stash them first` };
    }

    // Undo the Ship move on main, and any Ship column the app inserted when it read the board. The
    // card id is already in hand, so throwing the file away costs nothing. Only ever reached with the
    // guard above satisfied, and that folder is what the guard lets past — though only this one file
    // in it is thrown away. From HEAD rather than the index: `checkout -- <path>` restores what is
    // staged, so a board.json somebody had run `git add` on would keep the Ship move and the card
    // would sit in Ship on main from then on.
    try {
      await git(['checkout', 'HEAD', '--', BOARD_FILE_PATH], projectPath);
    } catch {
      // A project whose board.json is not committed yet has nothing to restore.
    }

    const base = await baseBranch(projectPath);
    await git(['fetch', 'origin', base], projectPath);
    // The checkout itself is only fast-forwarded when it is sitting on the base branch and can be.
    // A checkout on some other branch is left alone — the worktree comes off origin/<base> either
    // way, so it does not need the local branch to have caught up.
    try {
      const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
      if (head === base) await git(['merge', '--ff-only', `origin/${base}`], projectPath);
    } catch {
      // Diverged, or mid-rebase. The worktree is what matters and it comes off the remote.
    }

    const heads = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
    const branch = branchNameFor(title, cardId, heads.split('\n').filter((name) => name !== ''));
    const worktreePath = worktreePathFor(projectPath, branch);
    await git(['worktree', 'add', '-b', branch, worktreePath, `origin/${base}`], projectPath);

    // Recorded the moment the folder is on disk, and before the pane and before the commit below, so a
    // worktree that exists is always one Ctrl+W can show you and remove. An orphan worktree nothing
    // knows about is the thing that piles up unseen.
    const entry = recordWorktree({
      cardId, title, projectPath, branch, worktreePath, pane: null, startedAt: new Date().toISOString(),
    });

    // The card's Ship move, on the branch. The only board write that belongs to one; the agent makes
    // every move after it. The Ship column is there to move it into whatever the branch's file holds:
    // readBoard gives every board one, and a board with no file at all is the shipped four columns.
    const board = readBoard(worktreePath).board;
    const from = selectionOf(board, cardId);
    if (from) {
      const moved = moveCardToColumn(board, from, shipColumnIndex(board));
      writeBoard(worktreePath, moved.board);
      await git(['add', BOARD_FILE_PATH], worktreePath);
      // Nothing staged means the card is already in Ship on the base branch — shipped once before,
      // the worktree since removed. `git commit` with nothing to commit exits 1, which would fail the
      // ship in git's own words with the branch and the folder already made.
      const staged = await git(['diff', '--cached', '--name-only'], worktreePath);
      if (staged !== '') await git(['commit', '-m', `board: ship "${title}"`], worktreePath);
    }

    return attachPane(entry, slot);
  } catch (error: unknown) {
    return { ok: false, message: `ship failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    // In a finally, so a step that throws cannot leave the card locked for the rest of the run with
    // nothing on screen able to clear it.
    shippingCards.delete(cardId);
  }
});

ipcMain.handle('worktree:list', () => {
  worktrees = livingEntries(worktrees, existsSync);
  writeWorktrees(worktreesFile, worktrees);
  return worktrees;
});

// A channel of its own rather than riding along on worktree:list: board-view.ts calls that on every
// board open, and a `git status` per worktree behind it would put that many process spawns behind
// every Ctrl+B. Only the worktree dialog needs to know which ones are dirty, so only it asks this.
//
// blockingChanges is the same predicate worktree:remove asks, so the two can never disagree about
// what counts as dirty. Run concurrently — this is main, and every pane's bytes flow through it — and
// a worktree git cannot read (moved, deleted by hand) comes back unreadable rather than clean, since
// silence is not the same thing as no changes.
ipcMain.handle('worktree:dirty', async () => {
  const results = await Promise.all(worktrees.map(async (entry) => {
    try {
      const changed = blockingChanges(await git(['status', '--porcelain'], entry.worktreePath));
      return { worktreePath: entry.worktreePath, dirty: changed.length > 0, unreadable: false };
    } catch {
      return { worktreePath: entry.worktreePath, dirty: false, unreadable: true };
    }
  }));
  return {
    dirty: results.filter((result) => result.dirty).map((result) => result.worktreePath),
    unreadable: results.filter((result) => result.unreadable).map((result) => result.worktreePath),
  };
});

// Refused once for a dirty worktree, and only once: the changes in it exist nowhere else, so the
// question is worth asking, and refusing forever would mean the only way out is the command line.
ipcMain.handle('worktree:remove', async (_event, worktreePath: string, force: boolean) => {
  const entry = worktrees.find((candidate) => candidate.worktreePath === worktreePath);
  if (!entry) return { ok: false, message: 'no such worktree', dirty: [] };
  try {
    const dirty = blockingChanges(await git(['status', '--porcelain'], worktreePath));
    if (dirty.length > 0 && !force) return { ok: false, message: '', dirty };
    await git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], entry.projectPath);
    worktrees = withoutWorktree(worktrees, worktreePath);
    writeWorktrees(worktreesFile, worktrees);
    return { ok: true, message: `removed ${entry.branch}`, dirty: [] };
  } catch (error: unknown) {
    return {
      ok: false,
      message: `not removed: ${error instanceof Error ? error.message : String(error)}`,
      dirty: [],
    };
  }
});

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
