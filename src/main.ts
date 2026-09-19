import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
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
import { baseName } from './base-name';
import { git } from './git';
import { isOpenableLink } from './links';
import { agentArguments, editorArguments, pickShell } from './shell';
import { taskRunner } from './task-runner';
import { TITLE_BAR_HEIGHT } from './theme';
import {
  EDITOR_INDEX, TERMINAL_COUNT, paneFromId, paneIds, sizeOfPane, terminalId, type PaneSize,
} from './terminals';
import { BOARD_DIRECTORY, BOARD_FILE, BOARD_FILE_PATH, openBoard, readBoard, writeBoard } from './board-store';
import { readNotes, writeNotes } from './notes-store';
import { isBoardChange, isBoardFile } from './board-watch';
import { dropScrollbackFiles, editorSocket, openScrollback, removeSocket } from './nvim-remote';
import { readSession, writeSession, type Session } from './session';
import { workingPanes, WORKING_REPORT_MS } from './working-panes';
import type { PaneUse } from './free-pane';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings-store';
import {
  blockingChanges,
  branchNameFor,
  busyPanes,
  freePane,
  oneAtATime,
  paneIsBusy,
  runsAnAgent,
  uncommittedCount,
  workPrompt,
  worktreePathFor,
  worktreesRoot,
  type PaneCommand,
  type PaneReading,
} from './ship';
import { NO_USAGE, snapshotOf, usageDiffers, type FileUsage, type UsageSnapshot } from './usage';
import { liveSessions, sweepUsage } from './usage-store';
import { parentProcesses, sessionsByPane } from './pane-sessions';
import {
  claimsPane,
  entryForCard,
  entryForPath,
  livingEntries,
  readWorktrees,
  stillLiving,
  withEntry,
  withoutPane,
  withoutPanes,
  withoutWorktree,
  worktreesDiffer,
  writeWorktrees,
  type WorktreeEntry,
} from './worktree-store';
import type { Settings } from './settings';
import { moveCardById, shipColumnIndex, type Board } from './board';
import { reviewSweep } from './review-flow';
import type { ShipRequest, ShipResult, WorktreeList, WorktreeRemoval } from './bridge';

if (started) app.quit();

// Packaged apps cannot ship a per-user .env inside the bundle, so read it from the home config directory.
const environmentFile = app.isPackaged
  ? path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'dashboard', '.env')
  : path.join(app.getAppPath(), '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

// Empty at launch: every project comes from the picker, and the recents list remembers them across runs.
// One per slot, and a slot is what every pane of that project is named by — so a project that is
// closed empties its place rather than leaving the list: splice it out and every project behind it
// would be renamed onto ids whose shells are somebody else's. A hole is never filled again either, for
// the same reason read the other way round: a new project in an old slot inherits the ids that a
// notification, a worktree record or a board's ship may still be naming.
const projects: (Project | undefined)[] = [];
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
let worktrees: WorktreeEntry[] = withoutPanes(livingEntries(readWorktrees(worktreesFile), existsSync));
writeWorktrees(worktreesFile, worktrees);
// The cards whose ship is running right now. Two ships of one card both get past the already-shipped
// check before either has recorded anything, and the second record replaces the first: two branches
// and two folders on disk, and the one nothing points at can neither be seen nor removed from inside
// the app.
const shippingCards = new Set<string>();
// The worktrees a removal is part way through. `git worktree remove` is awaited, and git unlinks the
// folder before it answers, so without this the sweep lands in that gap, calls the record dead and
// hands its pane back to the project — and the kill that follows the removal then finds no pane in the
// worktree and leaves the agent running in a folder git has just deleted, writing errors into a pane
// the app counts as free. Held for the length of the one removal, the way shippingCards is.
const removingWorktrees = new Set<string>();
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
// How big each pane is, last the renderer measured it. Kept for the panes that have no shell right
// now as much as for the ones that do, since a pty is spawned here and the window it draws into is
// only visible on the other side of the wire. sizeOfPane is where the rule lives.
const paneSizes = new Map<string, PaneSize>();
// The shell each pane was actually spawned with, written when the pty starts. Not the shellCommand
// above: that is the live setting, and changing it leaves every already-running pane on the shell it
// started with — which is what the settings screen tells you. A ship reads what the pty says is in the
// foreground against this, so switching the setting cannot make five panes sitting at prompts read as
// running a program and refuse every ship after it.
const paneShells = new Map<string, string>();
// The `board` command, handed to every pane as DASHBOARD_BOARD so an agent in any project can move
// its own card without hand-editing JSON. .dashboard/CLAUDE.md is where it is documented, and that
// file is seeded into every project the app touches.
//
// Unpacked, because node is what runs it and node cannot read a file inside an asar. In a packaged
// app getAppPath() ends in app.asar and forge puts this one file in app.asar.unpacked beside it; in
// development there is no asar in the path and the replace does nothing.
const boardCommand = path
  .join(app.getAppPath(), '.vite', 'build', 'board-cli-entry.js')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
// Built once. Every pane gets the same one, and cloning the whole environment per pane is six clones
// per project opened for a value that never changes.
const paneEnvironment = { ...process.env, DASHBOARD_BOARD: boardCommand } as Record<string, string>;
// One watcher per open project, on its .dashboard folder, and the bytes the app itself last wrote
// there. Both keyed by project path: a slot can change hands, a path is the file.
const boardWatchers = new Map<string, FSWatcher>();
const boardTexts = new Map<string, string>();
// What each terminal id runs and where. Every pane is the same shell and differs only in what it is
// asked to run: nothing for the five terminals, nvim for the editor. The editor is registered here like
// any other, which is what lets the renderer start it later through the ordinary restart path.
// The editor's args are the literal string 'editor' rather than a precomputed array: they depend on the
// shell in force, and a project can sit open for a long time before its nvim key is ever pressed. Baking
// editorArguments(shellCommand) in here would freeze it at the shell the project opened with — change
// the shell afterwards and a project already open would still launch nvim through the old one.
const terminalCommands = new Map<string, PaneCommand>();
let mainWindow: BrowserWindow;
// True while the quit question is on screen. Every close is stopped, so without it holding Cmd+Q
// stacks a question per keypress and you answer the same one five times.
let askingToQuit = false;

function sendToRenderer(channel: string, ...payload: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...payload);
}

// What the pty says is in the foreground of a pane, or nothing when the pane has no shell. The tty can
// go between a shell dying and its exit arriving here, and a pane with nothing running in it is the
// right answer for a shell that has just died anyway — so a reading that fails is not one that takes a
// ship down with it.
//
// Unix only, which is why win32 answers nothing at all. `IPty.process` is a real foreground reading on
// unix — node-pty's UnixTerminal calls tcgetpgrp(fd) and names whoever holds the terminal — but
// WindowsTerminal's getter hands back the pty's *name*, which is the `xterm-256color` spawnTerminal
// asked for and never changes. Passing that on would have every pane on Windows read as running a
// program called xterm-256color from launch, every ship refused with five of them listed, and no
// gesture that clears it. Nothing is read there, so nothing is in the way: Windows gets the
// lowest-free-pane behaviour, and what a ship there can take out from under you is the same corner
// runsAProgram names below, one pane wider.
function foregroundOf(id: string): string | undefined {
  if (process.platform === 'win32') return undefined;
  try {
    return shells.get(id)?.process;
  } catch {
    return undefined;
  }
}

// Whether an agent is running in this card's pane. One spelling of it, because two things ask: the ship
// refuses a card that is already being worked, and the review sweep will not take a worktree away from
// a shell sitting in it. Two copies drift — widen the ship's half to count a pane whose agent has
// finished, leave the sweep's alone, and five seconds later the sweep removes the folder out from
// under that shell.
function agentRunsIn(slot: number, pane: number | null): boolean {
  return pane !== null && runsAnAgent(terminalCommands.get(terminalId(slot, pane)));
}

// What the renderer can see and main cannot: which panes still have an agent working in them. The
// reports land here; what they add up to is working-panes.ts's, with the floor and the reason for it.
const agentsAtWork = workingPanes();
ipcMain.on('panes:report', (_event, ids: string[]) => { agentsAtWork.report(ids, Date.now()); });

// The other direction, and the one thing only main can answer: what is running in each of a project's
// five shells. The command screen picks a pane to type into and closing a project refuses over the
// panes it would kill, and both used to work that out from what the panes had on their screens — where
// a dev server that has printed its banner looks exactly like a shell at a prompt. So `npm run dev` in
// terminal 1 read as free, and a line sent from the command screen was typed on top of it. This is the
// reading a ship already takes, so the three screens have one answer between them rather than two that
// disagree.
//
// The editor is not in it. It runs nvim for as long as the project is open, so on this reading it is
// busy from launch — a pane no command could ever land in and a project that could never be closed.
//
// A project with no slot here answers with nothing at all, and nothing is the truth: every shell this
// app has is in this file, so a project main cannot place has none left to run anything.
ipcMain.handle('panes:use', (_event, projectPath: string): PaneUse[] => {
  const slot = slotOfProject(projectPath);
  if (slot === -1) return [];
  return paneReadingsIn(slot, null).map((pane, index) => ({
    exited: !shells.has(terminalId(slot, index)),
    busy: paneIsBusy(pane),
  }));
});

// The question the review asks, which is the one above with "and has not finished" on the end. A ship
// is a keystroke and refuses on the weaker answer: you pressed it, and the status bar you are already
// looking at says why. The sweep runs on a five-second timer with nobody to tell, so an answer that
// only goes false when you close the pane by hand would mean no review ever starts by itself — the
// card sits in Ship reading `shipped · fix-login · terminal 3` all day with nothing on screen saying
// the app is waiting on you.
function agentWorksIn(slot: number, pane: number | null): boolean {
  return pane !== null && agentRunsIn(slot, pane) && agentsAtWork.works(terminalId(slot, pane), Date.now());
}

// A pane whose agent has exited. It goes back to being an ordinary pane: a plain shell, still in the
// worktree, because that is where the work is. Left alone, Enter would start the agent over instead
// of giving you a prompt, and the pane would stay counted as in use with nothing running in it.
function releaseAgentPane(id: string): void {
  const command = terminalCommands.get(id);
  if (!runsAnAgent(command)) return;
  terminalCommands.set(id, { args: [], directory: command.directory });
  // The record goes on naming the pane: the worktree list's Enter takes you to the pane its card was
  // shipped into, and the pane is still there. The claim ends where the pane is taken, in attachPane.
}

// The other half, for a pane whose worktree has gone rather than whose agent has: it goes back to a
// plain shell in the project, since the folder it was in is not there any more. That is also what puts
// the pane back at the front of the queue a ship picks from — freePane holds why a pane standing in a
// worktree is taken last, and this one is not standing in it any more.
function releaseWorktreePanes(entry: WorktreeEntry): void {
  for (const [id, command] of terminalCommands) {
    if (command.directory !== entry.worktreePath) continue;
    terminalCommands.set(id, { args: [], directory: entry.projectPath });
  }
}

// The pair the renderer draws a card's badge and the status bar's branch from. WorktreeList in bridge.ts
// is where the two of them being one answer is explained.
//
// The directories are read straight off terminalCommands rather than tracked beside it, so there is
// one copy of them. It is the spawn cwd, not the shell's: `cd` in a pane never reaches here, so the
// branch the status bar prints is the one the pane was opened in.
function worktreeList(): WorktreeList {
  return {
    entries: worktrees,
    paneDirectories: Object.fromEntries(
      Array.from(terminalCommands, ([id, command]) => [id, command.directory]),
    ),
  };
}

// The one place the record changes after launch. Every writer goes through it, so the file on disk and
// the screen are the same fact — a writer that updated one and not the other is how a card goes on
// naming a worktree that is not there any more. Whether a rewrite is worth a message is
// worktreesDiffer's to say.
//
// The records are what it looks at, not the pane directories riding along with them, and that is enough
// rather than lucky: the only two things that move a pane into or out of a worktree are a ship and a
// worktree removed, and both change a record here. A pane whose folder changes for any other reason —
// a project closed, a project opened in a freed slot, an agent exiting — has moved between two
// ordinary checkouts, which is not something the status bar prints or a badge reads.
function setWorktrees(next: WorktreeEntry[]): void {
  const changed = worktreesDiffer(worktrees, next);
  worktrees = next;
  // Neither half runs for a rewrite of what is already there — closing a project that shipped nothing
  // is one. The file already holds these bytes, written by whoever last changed them, and the board on
  // screen would be torn down and redrawn for a record nobody touched.
  if (!changed) return;
  writeWorktrees(worktreesFile, worktrees);
  sendToRenderer('worktree:change', worktreeList());
}

// Every record whose folder has stopped existing, and the panes with it. A worktree deleted by hand
// outside the app strands a pane exactly the way one removed inside it used to, so the two share this.
// What it does not do is kill whatever is running: a folder that went by other means may still have an
// agent doing something, and that is not this function's to decide.
function dropDeadWorktrees(): void {
  // Whether a tick that found nothing is worth a write is setWorktrees' to say, so there is no second
  // answer to that question here. What counts as living is stillLiving's — a folder mid-removal is not
  // dead just because git has already unlinked it.
  const living = livingEntries(worktrees, stillLiving(removingWorktrees, existsSync));
  for (const entry of worktrees) if (!living.includes(entry)) releaseWorktreePanes(entry);
  setWorktrees(living);
}

// A worktree taken away outside the app — `git worktree remove` typed in a pane, an agent tidying up
// after itself, an rm -rf — is not an event anything here hears. It used to be noticed only when the
// renderer next asked for the list, which is on arriving at a board: sit on the manager's stack of
// boards while an agent removes its own worktree and the card goes on reading
// `shipped · fix-login · terminal 3` until you leave the screen and come back to it.
//
// A handful of existsSync every few seconds, and the sweep is silent unless something has actually
// gone.
// The same tick asks every in-flight worktree whether its agent has finished. Not awaited and nothing
// waits on it: one tick's review is still running when the next arrives — git takes seconds — and the
// sweep guards against starting the same card twice.
setInterval(() => { dropDeadWorktrees(); void reviews.run(); }, WORKING_REPORT_MS).unref();

// Ctrl+`: the focused pane's scrollback, written to a file and opened in the project's nvim. Every
// decision in that is nvim-remote.ts; what is here is the channel and the temp folder it works in.
ipcMain.handle('scrollback:open', (_event, slot: number, index: number, text: string) => (
  openScrollback(app.getPath('temp'), shellCommand, slot, index, text)
));

function spawnTerminal(id: string): void {
  const entry = terminalCommands.get(id);
  if (entry === undefined) return;
  // The editor's socket is named after the slot, so the pane that is restarted listens where the same
  // pane listened before and nothing has to be told the name again. Anything left behind by a previous
  // run — a crash, a kill -9 — is cleared first: nvim refuses to listen on a path that already exists,
  // and the pane would show a one-line error instead of an editor.
  let args = entry.args;
  if (args === 'editor') {
    const socket = editorSocket(app.getPath('temp'), paneFromId(id).slot);
    removeSocket(socket);
    args = editorArguments(shellCommand, socket);
  }
  let terminalProcess: pty.IPty;
  try {
    const { cols, rows } = sizeOfPane(paneSizes, id);
    terminalProcess = pty.spawn(shellCommand, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: entry.directory,
      env: paneEnvironment,
    });
  } catch {
    // The shell itself may be missing — a stale SHELL_COMMAND, say. The pane shows the same exit line
    // a dead shell shows, rather than the spawn taking the window down. A missing nvim is not this case:
    // the shell starts, fails to find it, and exits 127 on its own.
    sendToRenderer('pty:exit', id, 127);
    return;
  }
  // What this pane is running from now on, whatever the setting moves to afterwards. Written here
  // because here is the only place a pty is spawned — the ship's, the editor's and a restart all come
  // through this function, so one line covers every pane that exists.
  paneShells.set(id, shellCommand);
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

// Watch a project's .dashboard folder and tell the renderer when the board in it becomes something
// the app did not write — the command line moving a card, or a hand edit. Idempotent, and called
// from the board read, which is the only way a board reaches the screen and the thing that creates
// the folder on a project that has never had one.
//
// Never a failure anyone sees. A platform that refuses the watch, a file that cannot be read: each
// costs the live redraw and nothing else, and the board is still re-read every time you enter it.
function watchBoard(projectPath: string): void {
  if (boardWatchers.has(projectPath)) return;
  const directory = path.join(projectPath, BOARD_DIRECTORY);
  let watcher: FSWatcher;
  try {
    watcher = watch(directory, (_event, fileName) => {
      // Before the read, not after: one save fires an event for board.json.tmp and another for the
      // rename, and reading the whole board for the first of them is work on the thread every pane's
      // bytes flow through.
      if (!isBoardFile(fileName)) return;
      let onDisk: string | null;
      try {
        onDisk = readFileSync(path.join(directory, BOARD_FILE), 'utf8');
      } catch {
        onDisk = null;
      }
      if (!isBoardChange(boardTexts.get(projectPath), onDisk)) return;
      // Remembered as if the app had written it, so the several events one save fires announce the
      // change once.
      boardTexts.set(projectPath, onDisk);
      sendToRenderer('board:change', projectPath);
    });
  } catch {
    return;
  }
  boardWatchers.set(projectPath, watcher);
}

function unwatchBoard(projectPath: string): void {
  boardWatchers.get(projectPath)?.close();
  boardWatchers.delete(projectPath);
  boardTexts.delete(projectPath);
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

// Point a pane at a worktree and start the agent in it. The pane keeps its id — it is still terminal
// 3 of that project — and only what it runs and where changes, which is exactly what terminalCommands
// exists to say. The old shell is killed first: retargeting a pane that is still running one would
// leave two processes writing to the same id.
//
// The prompt is the caller's, because there are two agents now: the one that works a card, and the one
// that reviews the pull request the first one opened.
function startAgent(id: string, worktreePath: string, prompt: string): void {
  terminalCommands.set(id, {
    args: agentArguments(shellCommand, prompt),
    directory: worktreePath,
  });
  // Working from this instant, rather than from the first report that catches its spinner. The reports
  // are on a timer and there is a second or two of Claude Code starting up before the spinner exists,
  // and the sweep in between would read the pane as quiet and take the folder away from the agent.
  agentsAtWork.started(id, Date.now());
  shells.get(id)?.kill();
  shells.delete(id);
  spawnTerminal(id);
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
  const matchIndex = slotOfProject(picked.path);
  const index = matchIndex === -1 ? projects.length : matchIndex;
  const replaced = replacesProject(projects[index], picked);
  if (replaced) {
    projects[index] = picked;
    spawnProject(picked, index);
  }
  // rememberRecentPath swallows its own failures: the shells are already running, so losing the history
  // entry must not fail the open and strand them on a slot the renderer has no page for.
  if (!picked.missing) rememberRecentPath(recentsFile, picked.path);
  // The slot holds a project either way by now: it was just filled, or the path matched one that is
  // open. `picked` is only what stops the type being optional, never an answer anyone receives.
  return { index, project: projects[index] ?? picked, replaced };
});
// Closing a project. Its six panes are killed and forgotten, and its slot is emptied. Nothing is
// answered: whether anything was running in it was read off the panes themselves, which only the
// renderer can see, and it has already refused or gone ahead by the time this arrives.
// The worktree records naming a pane in it give that pane up, for the reason the launch above clears
// every pane on read: no shell of this project survives the close, so a record still naming pane 2
// would put a branch under a pane that is a plain shell of some other project — and would hold its
// card in flight, unable to be shipped again, with nothing left running to finish it.
ipcMain.on('projects:close', (_event, slot: number) => {
  const closing = projects[slot];
  // A slot that holds nothing has already been closed, and there is nothing of it left to kill.
  // Answered first so a slot past the end of the list is not written into it as a hole.
  if (closing === undefined) return;
  projects[slot] = undefined;
  unwatchBoard(closing.path);
  for (const id of paneIds(slot)) {
    // Out of the map before the kill: the exit arrives afterwards and is dropped by the check in
    // spawnTerminal, so no pty:exit goes out for a pane the renderer has already taken off the screen.
    const terminalProcess = shells.get(id);
    shells.delete(id);
    terminalProcess?.kill();
    terminalCommands.delete(id);
    paneSizes.delete(id);
    paneShells.delete(id);
  }
  // A project that never shipped a card has nothing to give up here, and setWorktrees is the one that
  // knows it: withoutPanes hands back the same records and nothing is written or sent.
  setWorktrees(withoutPanes(worktrees, closing.path));
});
// Claude Code's own session logs, read for what each project and each pane has cost. Read-only and
// offline: nothing is asked of any server and nothing under ~/.claude is written. What the numbers
// mean is usage.ts's, the reading is usage-store.ts's, and which pane a session belongs to is
// pane-sessions.ts's — what is here is when the sweep runs.
const claudeLogs = path.join(homedir(), '.claude', 'projects');
const claudeSessions = path.join(homedir(), '.claude', 'sessions');
// Kept across sweeps, which is what makes every sweep after the first one nearly free: a log whose
// size has not moved is not opened at all.
const usageFiles = new Map<string, FileUsage>();
let usage: UsageSnapshot = NO_USAGE;

async function sweepTokenUsage(): Promise<void> {
  const now = Date.now();
  // Three reads that need nothing from each other: the logs, the process tree, and the sessions
  // Claude Code has running. The tree is the only thing that says which pane a session is in, and a
  // machine with no `ps` answers with none — the project figures still stand and the pane ones are
  // simply absent, which is the smaller half rather than the screen.
  const [, tree, sessions] = await Promise.all([
    sweepUsage(claudeLogs, usageFiles, now),
    runCommand('ps', ['-eo', 'pid=,ppid=']).then(({ stdout }) => stdout, () => ''),
    liveSessions(claudeSessions),
  ]);
  const panePids = new Map([...shells].map(([id, terminalProcess]) => [terminalProcess.pid, id]));
  const open = projects.flatMap((project) => (project === undefined
    ? []
    : [{ path: project.path, worktrees: worktreesRoot(project.path) }]));
  const next = snapshotOf(
    usageFiles.values(),
    open,
    sessionsByPane(parentProcesses(tree), panePids, sessions),
    now,
  );
  // Nothing crosses for a sweep that found the same figures. Whether that is worth a message is
  // usageDiffers's to say.
  const changed = usageDiffers(usage, next);
  usage = next;
  if (changed) sendToRenderer('usage:change', usage);
}

// Chained rather than on an interval, so a sweep that takes longer than the gap — a first read of
// half a gigabyte on a slow disk — cannot have the next one start on top of it.
function sweepUsageLater(delay: number): void {
  // The catch is not optional: `finally` re-throws what it was handed, and an unhandled rejection in
  // the main process is an uncaught exception that takes every pane's shell with it. A sweep that
  // finishes into a window that has just closed is the way there.
  setTimeout(() => {
    void sweepTokenUsage().catch(() => undefined).finally(() => sweepUsageLater(USAGE_SWEEP_MS));
  }, delay).unref();
}

// Every half minute, which is the rate the manager's rows already redraw themselves at. The first one
// waits: it is the only sweep that reads every log there has ever been, and a launch has five shells
// and a window to get on screen first.
const USAGE_SWEEP_MS = 30_000;
sweepUsageLater(3_000);

// The renderer's first read. Everything after it arrives unasked on usage:change.
ipcMain.handle('usage:read', () => usage);

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
  shells.get(id)?.write(data);
});
// Recorded whether or not a shell is listening, because the pane that has none is exactly the pane
// about to get one: a pane whose shell exited, the editor before nvim is started, a pane a ship is
// about to take. The record is what spawnTerminal spawns at; sizeOfPane holds why.
ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
  paneSizes.set(id, { cols, rows });
  shells.get(id)?.resize(cols, rows);
});
ipcMain.on('pty:restart', (_event, id: string) => {
  if (!shells.has(id)) spawnTerminal(id);
});
// Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
// is a convenience — writing the two explanation files — so a read-only project folder must not cost
// the user a board.json that is sitting right there and perfectly readable.
ipcMain.handle('board:read', (_event, projectPath: string) => {
  try {
    return openBoard(projectPath);
  } finally {
    // After the read, which is what creates .dashboard on a project that has never had a board — and
    // in a finally, because a read that throws still leaves a folder worth watching. Skip it there and
    // that board never notices the command line again for as long as you stay on the screen.
    watchBoard(projectPath);
  }
});
// invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
// The bytes are kept so the watcher can tell this write from somebody else's. Nothing is returned to
// the renderer: it already has the board it just sent.
ipcMain.handle('board:write', (_event, projectPath: string, board: Board) => {
  boardTexts.set(projectPath, writeBoard(projectPath, board));
});

// The project's page of notes. No watcher and no seeding: the notes are one box one person types
// into, and a project that has never had any has no file until the first keystroke lands.
ipcMain.handle('notes:read', (_event, projectPath: string) => readNotes(projectPath));
// invoke, not send, for the same reason board:write is: a write that fails rejects in the renderer
// and reaches the status bar, rather than leaving a page on screen that is not on disk.
ipcMain.handle('notes:write', (_event, projectPath: string, text: string) => {
  writeNotes(projectPath, text);
});

// Which page a project is open on, or -1. Two questions want it — opening a project that is already
// open, and finding the panes a review can take — and two copies of the walk would answer differently
// the day a slot means something other than an index into this array.
function slotOfProject(projectPath: string): number {
  return projects.findIndex((project) => project?.path === projectPath);
}

function recordWorktree(entry: WorktreeEntry): WorktreeEntry {
  setWorktrees(withEntry(worktrees, entry));
  return entry;
}

// The lowest-numbered pane of this project that nobody is using, or null. `freeing` is a pane that is
// about to be handed back — the one a worktree on its way out is holding — counted as free.
//
// One function because the review asks a step earlier than the ship does: before it removes the card's
// worktree, rather than after. Two spellings of "which panes are busy" would drift, and the drift costs
// a worktree — the folder deleted, then no pane for the review, and a card saying so where the
// checkout you were about to look at used to be.
function freePaneIn(slot: number, freeing: number | null = null): number | null {
  return freePane(paneReadingsIn(slot, freeing));
}

// Every pane of the project as ship.ts reads them.
function paneReadingsIn(slot: number, freeing: number | null): PaneReading[] {
  const projectPath = projects[slot]?.path;
  return Array.from({ length: TERMINAL_COUNT }, (_value, index): PaneReading => {
    // The pane being handed back is described as one with nothing in it, which is what it is a moment
    // later. Said once here rather than field by field, so a field added below cannot forget it.
    if (index === freeing) {
      return { foreground: undefined, shell: undefined, command: undefined, inWorktree: false };
    }
    const id = terminalId(slot, index);
    const command = terminalCommands.get(id);
    return {
      foreground: foregroundOf(id),
      shell: paneShells.get(id),
      command,
      inWorktree: command !== undefined && command.directory !== projectPath,
    };
  });
}

// Give the worktree a pane, if there is one going. Split out because it is also the whole of a second
// ship of a card whose worktree exists but never got one.
function attachPane(entry: WorktreeEntry, slot: number, prompt: string): ShipResult {
  // The project can be closed while the git half of a ship is still running, and its slot is empty from
  // then on. Without this the agent would start in a pane of a page nobody has — running, unreadable
  // and unreachable until the app quits. The worktree is already made and recorded, so shipping the
  // card again is what gives it a pane, in whatever project is open then.
  if (projects[slot] === undefined) {
    return {
      ok: false,
      message: `${baseName(entry.projectPath)} was closed mid-ship — the worktree is made, ship it again for a pane`,
    };
  }
  const readings = paneReadingsIn(slot, null);
  const pane = freePane(readings);
  if (pane === null) {
    return {
      ok: false,
      message: `every pane in ${baseName(entry.projectPath)} is in use — `
        + `${busyPanes(readings)} — free one and ship again`,
    };
  }
  // The pane may still be named by another card's record, whose agent has exited and left it in that
  // worktree. Taking the pane is what ends that claim, so the old record gives it up here — one record
  // per pane in this project — claimsPane holds why the project half of that matters.
  const claimed = claimsPane(worktrees, entry.projectPath, pane, entry.cardId);
  if (claimed) recordWorktree(withoutPane(claimed));
  startAgent(terminalId(slot, pane), entry.worktreePath, prompt);
  return { ok: true, entry: recordWorktree({ ...entry, pane }) };
}

// The card's Ship move, on the branch. The only board write that belongs to a ship; the agent makes
// every move after it. The Ship column is there to move it into whatever the branch's file holds:
// readBoard gives every board one, and a board with no file at all is the shipped four columns.
//
// Run again by a ship that is being finished rather than started, so it has to be safe to repeat: a
// card already in Ship stages nothing, and `git commit` with nothing to commit exits 1, which would
// fail the ship in git's own words with the branch and the folder already made. Nothing staged also
// covers the card never having been on the base branch's board at all.
async function commitShipMove(entry: WorktreeEntry): Promise<void> {
  const board = readBoard(entry.worktreePath).board;
  const moved = moveCardById(board, entry.cardId, shipColumnIndex(board));
  if (!moved) return;
  writeBoard(entry.worktreePath, moved);
  // Both halves name the board file. A resumed ship runs in a worktree that has been lived in, so
  // "is anything staged" would answer yes to whatever the agent had `git add`ed and commit its
  // half-finished work under a board message.
  await git(['add', BOARD_FILE_PATH], entry.worktreePath);
  const staged = await git(['diff', '--cached', '--name-only', '--', BOARD_FILE_PATH], entry.worktreePath);
  if (staged !== '') {
    await git(['commit', '-m', `board: ship "${entry.title}"`, '--', BOARD_FILE_PATH], entry.worktreePath);
  }
}

// Ships in one project run one after another, never together; ship.ts says why. A review of a card in
// that project is queued behind them too: it runs `git worktree` twice in the same repository.
const shipInProject = oneAtATime();

// The other half of a ship, which runs on the tick above rather than on a keystroke. Every decision in
// it is review-flow.ts's; what is handed over here is only what this file knows — the records, the
// pages, the panes — and the two steps, which are the ones a ship already takes.
const reviews = reviewSweep({
  worktrees: () => worktrees,
  slotOf: slotOfProject,
  agentWorksIn,
  freePaneIn,
  removeWorktree,
  addWorktree: (entry) => git(['worktree', 'add', entry.worktreePath, entry.branch], entry.projectPath),
  startReview: (entry, slot, prompt) => attachPane(recordWorktree(entry), slot, prompt),
  queue: shipInProject,
});

// The whole ship, in the order the design doc sets out. Each step's failure stops the flow and comes
// back as a message the board's status bar prints; everything before it is left as it was. Every git
// command below runs with the project's queue held, so nothing else here is touching this repository.
async function runShip(request: ShipRequest): Promise<ShipResult> {
  const { projectPath, cardId, title, slot } = request;
  const dirty = blockingChanges(await git(['status', '--porcelain'], projectPath));
  if (dirty.length > 0) {
    return { ok: false, message: `${uncommittedCount(dirty)} — commit or stash them first` };
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
  // worktree that exists is always one the worktree list can show you and remove. An orphan worktree
  // nothing knows about is the thing that piles up unseen.
  const entry = recordWorktree({
    cardId, title, projectPath, branch, worktreePath, pane: null, startedAt: new Date().toISOString(),
    reviewing: false,
  });

  await commitShipMove(entry);
  return attachPane(entry, slot, workPrompt(cardId));
}

ipcMain.handle('worktree:create', async (_event, request: ShipRequest): Promise<ShipResult> => {
  const { projectPath, cardId, title, slot } = request;
  dropDeadWorktrees();
  // A card being shipped is a card whose last review, if it had one, is over. Left marked, the pull
  // request this ship goes on to open would never be reviewed for the rest of the run, with nothing
  // saying why. This is half the mark; the other half is `reviewing` on the record, cleared below.
  reviews.forget(cardId);

  // Already shipped, and still being worked on — a second worktree for the same card is the mistake
  // the record exists to catch. The pane on the record is not the question: a record keeps naming its
  // pane after the agent exits, so Enter on the worktree list still lands on the shell it left behind.
  // What refuses the ship is an agent actually running in there.
  const existing = entryForCard(worktrees, cardId);
  if (existing && agentRunsIn(slot, existing.pane)) {
    return { ok: false, message: `"${title}" is already shipped on ${existing.branch}` };
  }

  // Two ships of one card are a mistake and are refused. Two of different cards in one project are
  // both wanted, so the second waits behind the first rather than racing it onto git's index lock.
  if (shippingCards.has(cardId)) return { ok: false, message: `"${title}" is already being shipped` };
  shippingCards.add(cardId);
  try {
    return await shipInProject(projectPath, async () => {
      if (!existing) return runShip(request);
      // An existing record that got past the refusal is a card nothing is running for: a ship that
      // stopped part way — out of panes, or failed after the worktree was made — or one whose agent has
      // since exited. Which of those it was is not written down, so this finishes the work
      // rather than assuming only the pane is missing — an agent started in a worktree whose Ship move
      // is sitting uncommitted would have nothing left to commit it. Queued like a first ship, because
      // it runs git in the same repository.
      await commitShipMove(existing);
      // `reviewing: false` is the other half of the forget above. A record that was the review keeps
      // the flag through this spread otherwise, and the sweep skips the card for good: the pull
      // request this ship opens is never reviewed, with nothing on screen saying why.
      return attachPane({ ...existing, reviewing: false }, slot, workPrompt(cardId));
    });
  } catch (error: unknown) {
    return { ok: false, message: `ship failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    // In a finally, so a step that throws cannot leave the card locked for the rest of the run with
    // nothing on screen able to clear it.
    shippingCards.delete(cardId);
  }
});

// The renderer's first read, and the worktree dialog's own on the way open — the one screen that wants
// a sweep run right now rather than on the next tick. Everything else arrives on worktree:change.
ipcMain.handle('worktree:list', () => {
  dropDeadWorktrees();
  return worktreeList();
});

// A channel of its own rather than riding along on worktree:list and worktree:change, which reach the
// renderer at launch and after every ship, removal and project close. A `git status` per worktree
// behind all of those would be that many process spawns for an answer only the worktree dialog shows.
//
// blockingChanges is the same predicate worktree:remove asks, so the two can never disagree about
// what counts as dirty. Run concurrently — this is main, and every pane's bytes flow through it — and
// a worktree git cannot read (moved, deleted by hand) comes back unreadable rather than clean, since
// silence is not the same thing as no changes.
ipcMain.handle('worktree:check', async () => {
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
//
// A function rather than only a handler, because the review takes the same step: a card whose agent
// has finished has its worktree thrown away before a fresh one is made on the branch.
async function removeWorktree(worktreePath: string, force: boolean): Promise<WorktreeRemoval> {
  const entry = entryForPath(worktrees, worktreePath);
  // A path with no record is the removal having already happened — the sweep dropped it while the
  // dialog's question was on screen, or a second `d` landed on a row that had gone. There is nothing to
  // remove and no project to ask git from, and the goal state already holds, so this answers yes rather
  // than refusing. Refusing sends the dialog down its failure path and offers to force-delete a folder
  // that is not there.
  if (!entry) return { ok: true, message: '', dirty: [] };
  removingWorktrees.add(worktreePath);
  try {
    // A folder deleted by hand cannot be asked whether it is dirty: git is spawned into a cwd that is
    // not there, and node fails with `spawn git ENOENT` — its own failure to start a process, which
    // read as the reason your removal was refused and told you nothing you could act on. Nothing is at
    // risk in a folder that is gone, and git's own unforced remove is happy to prune a worktree whose
    // folder has vanished, so the question is skipped rather than asked and lost.
    const dirty = existsSync(worktreePath)
      ? blockingChanges(await git(['status', '--porcelain'], worktreePath))
      : [];
    if (dirty.length > 0 && !force) return { ok: false, message: '', dirty };
    await git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], entry.projectPath);
    // The agent goes with the folder it was working in: leaving it running leaves it writing into a
    // directory git has just deleted. Only here, where the folder was deleted on purpose.
    for (const [id, command] of terminalCommands) {
      if (command.directory === worktreePath) shells.get(id)?.kill();
    }
    releaseWorktreePanes(entry);
    setWorktrees(withoutWorktree(worktrees, worktreePath));
    return { ok: true, message: `removed ${entry.branch}`, dirty: [] };
  } catch (error: unknown) {
    return {
      ok: false,
      message: `not removed: ${error instanceof Error ? error.message : String(error)}`,
      dirty: [],
    };
  } finally {
    // In a finally, so a removal that throws part way cannot hold a dead record past the sweep for the
    // rest of the run.
    removingWorktrees.delete(worktreePath);
  }
}

ipcMain.handle('worktree:remove', (_event, worktreePath: string, force: boolean) => (
  removeWorktree(worktreePath, force)
));

// The command screen. What it does with the processes it spawns is task-runner.ts's; what is handed
// over here is only what this file knows — the way to the renderer, and the shell the settings screen
// last picked.
const tasks = taskRunner({
  send: (result) => sendToRenderer('task:update', result),
  shellCommand: () => shellCommand,
});

ipcMain.on('task:run', (_event, command: string, projectPaths: string[]) => tasks.run(command, projectPaths));
ipcMain.on('task:cancel', () => tasks.cancel());

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
      // Chromium throttles a hidden page's timers, and after five minutes behind another window that
      // is once a minute. Everything this app does on a beat is a renderer timer: the pane refresh, the
      // bell, and the report saying which panes still have an agent working in them. Main's review
      // sweep is a Node timer and keeps its five seconds, so with throttling on it reads a report a
      // minute old, decides the agent has gone quiet and removes the worktree out from under a push
      // that is still running. Minimise the window while a shipped card is being worked and the commit
      // dies with the folder. A grid of terminals is not a page that should stop ticking when it is
      // behind something.
      backgroundThrottling: false,
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
  // The transcripts this run put in the temp folder go with it, rather than sitting there until
  // something else tidies up.
  dropScrollbackFiles();
  // A task child is spawned detached, in a process group of its own, so it outlives the app unless it
  // is killed here as well — five `npm test` runs still burning CPU with no window naming them.
  tasks.stop();
});
app.on('window-all-closed', () => app.quit());
