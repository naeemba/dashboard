import { app, BrowserWindow, dialog } from 'electron';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as pty from 'node-pty';
import started from 'electron-squirrel-startup';
import { projectFromPath, readRecentPaths, rememberRecentPath, replacesProject, type Project } from './projects';
import { baseName } from './base-name';
import { git, runProgram } from './git';
import { forgetSize, realPath, scanWorktrees, worktreeState } from './worktree-scan';
import { shellDirectories, shellLiveness } from './shell-directory-lookup';
import { processTree } from './process-tree';
import { paneScreenCopy, type PaneScreenCopy } from './pane-screen-copy';
import { agentArguments, agentResumeArguments, editorArguments, pickShell } from './shell';
import { registerTasks } from './task-runner';
import { openAppWindow } from './app-window';
import { EDITOR_INDEX, MAIN_INDEX, paneFromId, sizeOfPane, terminalId } from './terminals';
import { nextPaneIndex } from './pane-layout';
import { mainArguments } from './dispatch';
import { projectOfFolder, sessionRequests } from './session-requests';
import { listenForSessions, sessionSocketPath } from './session-socket';
import { unfinishedWork } from './finished-work';
import { makeThrowawayWorktree } from './branch-worktree';
import { LOCAL_SCREEN, screens, windowHears } from './screens';
import { boardChanges } from './board-changes';
import { peekBoard, writeBoard } from './board-store';
import { readMarkets } from './markets-fetch';
import { boardWatchers } from './board-watch';
import { failureReporter, failureText } from './failure';
import { dropScrollbackFiles, editorSocket, removeSocket } from './nvim-remote';
import { registerPaneChannels } from './pane-channels';
import { registerChatSessions } from './chat-sessions';
import { startHost, type HeldByMain } from './host-wiring';
import { connectAtLaunch, registerRemote } from './remote-ipc';
import { registerPaneOpeners } from './pane-openers';
import { channels, registerWithIpc } from './channels';
import { agentStartEntry, paneExitEntry, removalEntry, shipEntry } from './log-entry';
import { registerLog } from './log-ipc';
import { registerProjectFiles, watchProjectBoard } from './project-files-ipc';
import { sessionStore } from './session-store';
import { agentToResume, mainResume, resumeLine, type PaneConversation } from './claude-resume';
import { workingPanes, WORKING_REPORT_MS } from './working-panes';
import { keepHostToken } from './host-token';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings-store';
import { changedFiles, oneAtATime } from './ship';
import {
  freePane,
  paneIsBusy,
  programIn,
  runsAnAgent,
  shipCanTake,
  type PaneCommand, type PaneReading, type PaneUse,
} from './pane-reading';
import { usageSweep } from './usage-sweep';
import {
  claimsPane,
  entryForCard,
  entryForPath,
  livingEntries,
  readWorktrees,
  stillLiving,
  withEntry,
  withoutPane,
  panesAtLaunch,
  withoutPanes,
  withoutWorktree,
  worktreesDiffer,
  writeWorktrees,
  type WorktreeEntry,
} from './worktree-store';
import type { Settings } from './settings';
import { reviewSweep } from './review-flow';
import { shipFlow } from './ship-flow';
import type { OpenProjects, ShipRequest, ShipResult, WorktreeList, WorktreeRemoval } from './bridge';

if (started) app.quit();

// Packaged apps cannot ship a per-user .env inside the bundle, so read it from the home config directory.
const environmentFile = app.isPackaged
  ? path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'dashboard', '.env')
  : path.join(app.getAppPath(), '.env');
// Declared here, ahead of the reporter below, because failures.say reads it and the .env read a few
// lines down can hold a message before a window exists — hold now reaches for the bar straight away
// rather than waiting for a later drain, so this read has to have already run.
let mainWindow: BrowserWindow;
// Everything a failure costs, and whether the app survives one, is failure.ts's. What is wired here is
// the bar, the box and the exit, and the two handlers that make it the process's last resort.
//
// First in the file, because the .env read below is the first thing that carries on past a failure.
const failures = failureReporter({
  say: (message) => {
    // The window, plus the one question only this sender asks: a message sent to a page that has not
    // run its listeners yet lands nowhere at all, so it waits for did-finish-load instead.
    const window = liveWindow();
    if (!window || window.webContents.isLoading()) return false;
    window.webContents.send('failure:show', message);
    return true;
  },
  // exit rather than quit, for the reason the worktree read below gives: quit runs the ordinary
  // shutdown over a main process that is half built and has nothing to shut down yet.
  stop: (title, detail) => { dialog.showErrorBox(title, detail); app.exit(1); },
});
process.on('uncaughtException', (error: unknown) => failures.report(error));
process.on('unhandledRejection', (error: unknown) => failures.report(error));
const table = channels();
const logStore = registerLog(table, app.getPath('userData'), sendToRenderer);
const boardLog = boardChanges((draft) => logStore.log(draft), peekBoard);

// The app opens without it. What is in this file is a shell command and a list of project folders, so a
// launch that cannot read it opens on the shipped defaults with nothing you set applied — worth a line
// on the status bar, not worth the window.
//
// It has to be a try, not a check: existsSync says yes for a directory and for a file whose permissions
// have gone, and loadEnvFile throws on both. Before this, a .env that was a folder meant double-clicking
// Dashboard and having nothing happen at all — no window, no message, the icon bouncing once.
if (existsSync(environmentFile)) {
  try {
    process.loadEnvFile(environmentFile);
  } catch (error: unknown) {
    failures.hold(`${environmentFile} was not read: ${failureText(error)}`);
  }
}

// Empty at launch: every project comes from the picker, and the recents list remembers them across runs.
// One per slot, and a slot is what every pane of that project is named by — so a project that is
// closed empties its place rather than leaving the list: splice it out and every project behind it
// would be renamed onto ids whose shells are somebody else's. A hole is never filled again either, for
// the same reason read the other way round: a new project in an old slot inherits the ids that a
// notification, a worktree record or a board's ship may still be naming.
const projects: (Project | undefined)[] = [];
// The recently opened projects live next to the app's other per-user state.
const recentsFile = path.join(app.getPath('userData'), 'recents.json');
const worktreesFile = path.join(app.getPath('userData'), 'worktrees.json');
// Dropped on read, so a worktree removed by hand outside the app does not leave its card marked as in
// flight forever with nothing able to clear it.
//
// Every pane comes back null with it. No shell outlives the app, so nothing this file says was in
// pane 2 is in pane 2 a moment after launch: that pane is a plain shell in the project, and a record
// still naming it would put a branch name under the status bar of a checkout the pane is not in —
// which is the wrong-checkout mistake the branch is printed there to prevent. A card's agent that a
// restart resumes is in that pane again, and resumeIn names it on the record again. Clearing it also gives
// the worktree back: a card with no pane is the one ship that is allowed to run again, and shipping
// it hands the folder that is already there to a pane. Written out, so the file says what this says.
//
// The read throws rather than answering an unreadable file with an empty list, and readWorktrees says
// why. Nothing below could carry on without the list, so the launch stops here: a box naming the file,
// then exit. showErrorBox is the only dialog there is before the app is ready — every other one wants
// a window, and there is not going to be one — and the message is all anyone gets, so it names the
// file. exit rather than quit, because quit runs the ordinary shutdown over a main process that is
// half built and has nothing to shut down yet.
let worktrees: WorktreeEntry[] = [];
// The pane each card's agent was in when the app last ran, kept from before the clearing so a restart
// resumes the agent in that pane and nowhere else. agentToResume holds why.
let agentPanesBeforeLaunch = new Map<string, number>();
try {
  const recorded = livingEntries(readWorktrees(worktreesFile), existsSync);
  ({ entries: worktrees, panes: agentPanesBeforeLaunch } = panesAtLaunch(recorded));
} catch (error: unknown) {
  dialog.showErrorBox(
    'Dashboard cannot read its worktree record',
    `${worktreesFile}\n\n${failureText(error)}\n\nNothing has been changed. Open Dashboard again once that file can be read.`,
  );
  app.exit(1);
}
// Outside the try: a failed write is worktree-store's to swallow, and inside it would read as a write
// that can stop the launch.
writeWorktrees(worktreesFile, worktrees);
// The worktrees a removal is part way through. `git worktree remove` is awaited, and git unlinks the
// folder before it answers, so without this the sweep lands in that gap, calls the record dead and
// hands its pane back to the project — and the kill that follows the removal then finds no pane in the
// worktree and leaves the agent running in a folder git has just deleted, writing errors into a pane
// the app counts as free. Held for the length of the one removal, the way ship-flow.ts holds a ship.
const removingWorktrees = new Set<string>();
const settingsFile = settingsFilePath(app.getPath('home'), process.env.XDG_CONFIG_HOME);
// Read before the window exists: the background colour paints the first frame, and the shell command
// spawns the first pane. Both are needed before the renderer has run a line.
const isMac = process.platform === 'darwin';
let settings = keepHostToken(readSettings(settingsFile, isMac), (made) => writeSettings(settingsFile, made, isMac));
// A file an older build wrote spelled out every shipped key and colour as if they had been chosen, and
// nothing strips those lines until the settings screen is next opened. Tidying it once here drops
// everything that still matches this build, so the next default to move reaches these people. It cannot
// give back a default that has already moved: a line the old build wrote is identical to one typed on
// purpose. What the file holds and what survives is tidySettingsFile's to say, not this line's.
tidySettingsFile(settingsFile, isMac);
let shellCommand = pickShell(settings, process.env, process.platform);
const shells = new Map<string, pty.IPty>();
const screenCopies = new Map<string, PaneScreenCopy>();
// How big each pane is, last the renderer measured it. Kept for the panes that have no shell right
// now as much as for the ones that do, since a pty is spawned here and the window it draws into is
// only visible on the other side of the wire. sizeOfPane is where the rule lives.
const paneScreens = screens();
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
// The `session` command, built and unpacked the same way, and the socket it reaches this app on.
// session-socket.ts says why the socket is this run's own.
const sessionCommand = boardCommand.replace('board-cli-entry.js', 'session-cli-entry.js');
const sessionSocket = sessionSocketPath(process.platform, app.getPath('temp'), process.pid);
// Built once. Every pane gets the same one, and cloning the whole environment per pane is a clone per
// pane opened for a value that never changes.
const paneEnvironment = {
  ...process.env, DASHBOARD_BOARD: boardCommand, DASHBOARD_SESSION: sessionCommand, DASHBOARD_SOCKET: sessionSocket,
} as Record<string, string>;
// One watcher per open project, on its .dashboard folder. Every decision in it is board-watch.ts's;
// what main adds is the one thing only it can do, which is tell the renderer.
const boards = boardWatchers((projectPath) => {
  sendToRenderer('board:change', projectPath);
  boardLog.changed(projectPath);
});
// What each terminal id runs and where. Every pane is the same shell and differs only in what it is
// asked to run: nothing for the five terminals, nvim for the editor. The editor is registered here like
// any other, which is what lets the renderer start it later through the ordinary restart path.
// The editor's args are the literal string 'editor' rather than a precomputed array: they depend on the
// shell in force, and a project can sit open for a long time before its nvim key is ever pressed. Baking
// editorArguments(shellCommand) in here would freeze it at the shell the project opened with — change
// the shell afterwards and a project already open would still launch nvim through the old one.
const terminalCommands = new Map<string, PaneCommand>();

// The one place that answers whether there is a window a message can reach. Both senders ask it, so
// there is never a second copy of that question to drift from this one.
function liveWindow(): BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
}

// Every push goes to the local window and to every remote screen. remoteHost is set once at launch,
// below, and is null when the settings give no port. tellOthers skips the screen that caused it.
function sendToRenderer(channel: string, ...payload: unknown[]): void { tellOthers('', channel, ...payload); }
function tellOthers(screen: string, channel: string, ...payload: unknown[]): void {
  if (windowHears(screen, remote.reachesWindow())) liveWindow()?.webContents.send(channel, ...payload);
  remoteHost?.broadcast(channel, payload, screen);
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
table.on('panes:report', (_screen, ids: string[]) => { agentsAtWork.report(ids, Date.now()); });

// The other direction, and the one thing only main can answer: the reading of a project's terminals,
// for the two screens that also have to know what is running in a pane. pane-reading.ts holds what
// the shape is for and why they stopped reading it off the panes themselves.
//
// The reading itself, not an answer made from it, because the two ask different things of it: the pick
// wants the worktree tie-break, and the refusal wants to name the program it found.
//
// `exited` is the one field a reading has no room for, and it is main's too — the shells map here is
// what `pty:exit` is sent from, so the renderer's own flag is a copy of this one.
//
// The editor is not in it. It runs nvim for as long as the project is open, so on this reading it is
// busy from launch — a pane no command could ever land in and a project that could never be closed.
//
// A project with no slot here answers with nothing at all, and nothing is the truth: every shell this
// app has is in this file, so a project main cannot place has none left to run anything.
table.handle('panes:read', (_screen, projectPath: string): PaneUse[] => {
  const slot = slotOfProject(projectPath);
  if (slot === -1) return [];
  return paneReadingsIn(slot)
    .map((pane) => ({ ...pane, exited: !shells.has(terminalId(slot, pane.index)) }));
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
//
// Main is the exception: it is the project's session, so Enter there starts it again.
function releaseAgentPane(id: string): void {
  const command = terminalCommands.get(id);
  if (!runsAnAgent(command) || paneFromId(id).index === MAIN_INDEX) return;
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

// The panes with a live shell opened in this folder: the ones a removal kills.
function shellsIn(worktreePath: string): string[] {
  return Array.from(terminalCommands)
    .filter(([id, command]) => command.directory === worktreePath && shells.has(id))
    .map(([id]) => id);
}

// shell-directory-lookup.ts says what asking a shell where it is means.
const shellLivesIn = shellLiveness({
  shells, opened: terminalCommands, shellsIn, ask: shellDirectories(processTree),
});

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
// rather than lucky: the only things that move a pane into or out of a worktree are a ship, a card's
// agent resumed after a restart, and a worktree removed, and all three change a record here. A pane whose folder changes for any other reason —
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
//
// Two sweeps on one tick and neither needs anything from the other, so they are caught apart. Written
// as one statement, the worktree half throwing meant the review half never ran — and the same throw
// lands on every tick, so no review would start again for the rest of the run: a card whose agent has
// opened its pull request sits on `shipped · fix-login · terminal 3` forever, with nothing on any
// screen saying why.
setInterval(() => {
  // Held, not reported, for the same reason the token sweep above is: this tick starts ticking at
  // module scope, before a window has necessarily opened, and a failure here has a known, nameable
  // cost — a worktree list or a review run gone stale — not the unknown one report() is for.
  try {
    dropDeadWorktrees();
  } catch (error: unknown) {
    failures.hold(`Worktree list not updated: ${failureText(error)}`);
  }
  // While this app is a screen of another host nothing reports this machine's agents; working-panes.ts
  // says what that means for the sweep, before and after coming home.
  agentsAtWork.away(remote.current() !== null, Date.now());
  void reviews.run().catch((error: unknown) => failures.hold(`Review check failed: ${failureText(error)}`));
}, WORKING_REPORT_MS).unref();

registerPaneOpeners(table, {
  shellCommand: () => shellCommand,
  paneFolders: (slot, index) => {
    const id = terminalId(slot, index);
    return { pid: shells.get(id)?.pid, startDirectory: terminalCommands.get(id)?.directory, projectPath: projects[slot]?.path };
  },
});

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
    const { cols, rows } = sizeOfPane(paneScreens, id);
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
    screenCopies.get(id)?.exit(127);
    sendToRenderer('pty:exit', id, 127);
    return;
  }
  // What this pane is running from now on, whatever the setting moves to afterwards. Written here
  // because here is the only place a pty is spawned — the ship's, the editor's and a restart all come
  // through this function, so one line covers every pane that exists.
  paneShells.set(id, shellCommand);
  const copy = paneScreenCopy(() => terminalProcess);
  screenCopies.set(id, copy);
  terminalProcess.onData((data) => { copy.push(data); sendToRenderer('pty:data', id, data); });
  terminalProcess.onExit(({ exitCode }) => {
    // Only when this is still the pane's shell. A ship kills the shell in the pane it takes and starts
    // the agent in the same tick, and the killed shell's exit arrives after that: without the check it
    // would drop the agent out of the map, leaving nothing for your keystrokes to reach, and tell the
    // renderer a pane that is busy working had died.
    if (shells.get(id) !== terminalProcess) return;
    shells.delete(id);
    const { slot, index } = paneFromId(id);
    logStore.log(paneExitEntry(projects[slot]?.path, index, exitCode, agentRunsIn(slot, index)));
    releaseAgentPane(id);
    copy.exit(exitCode);
    sendToRenderer('pty:exit', id, exitCode);
  });
  shells.set(id, terminalProcess);
}

// A project starts with its main session, plus a worker for each pane that was running Claude Code when
// the app last quit — session-store.ts says when it was. Which of the first pane's comes back as main
// is mainResume's; one that was not main's comes back in a worker after the rest.
// The editor is registered but not started: opening nine projects should not launch nine editors, each
// with its own swap files, that you never asked for.
function spawnProject(project: Project, projectIndex: number): void {
  if (project.missing) return;
  const mainId = terminalId(projectIndex, MAIN_INDEX);
  const first = mainResume(claudeSessions.takeResume(project.path, MAIN_INDEX, mainId), project.path, realPath);
  terminalCommands.set(mainId, { args: mainArguments(shellCommand, project.path, first.session), directory: project.path });
  spawnTerminal(mainId);
  for (const index of claudeSessions.owedResumes(project.path)) {
    const id = terminalId(projectIndex, index);
    const owed = claudeSessions.takeResume(project.path, index, id);
    terminalCommands.set(id, { args: [], directory: project.path });
    if (owed !== null) resumeIn(id, project.path, index, owed);
  }
  if (first.worker) {
    const id = terminalId(projectIndex, nextPaneIndex(openPanes(projectIndex)));
    terminalCommands.set(id, { args: [], directory: project.path });
    resumeIn(id, project.path, MAIN_INDEX, first.worker);
  }
  terminalCommands.set(terminalId(projectIndex, EDITOR_INDEX), { args: 'editor', directory: project.path });
}

// A session that ran as a card's agent comes back as it, exactly as the ship started it; agentToResume
// says which sessions those are. Its record names the pane again, so the status bar prints the branch,
// a second ship of the card is refused, and the review sweep waits for it rather than starting beside
// it. Any other session is typed into a shell in its folder, so exiting it leaves a prompt.
function resumeIn(id: string, projectPath: string, savedIndex: number, resume: PaneConversation): void {
  const card = agentToResume(worktrees, agentPanesBeforeLaunch, resume, projectPath, savedIndex, realPath);
  if (card !== undefined) {
    recordWorktree({ ...card, pane: paneFromId(id).index });
    startAgent(id, card.worktreePath, agentResumeArguments(shellCommand, resume.session));
    return;
  }
  terminalCommands.set(id, { args: [], directory: resume.directory });
  spawnTerminal(id);
  shells.get(id)?.write(resumeLine(resume));
}

// Point a pane at a worktree and start the agent in it. The pane keeps its id — it is still terminal
// 3 of that project — and only what it runs and where changes, which is exactly what terminalCommands
// exists to say. The old shell is killed first: retargeting a pane that is still running one would
// leave two processes writing to the same id.
//
// What it runs is the caller's, because there are three agents now: the one that works a card, the one
// that reviews the pull request the first one opened, and either of them resumed after a restart.
function startAgent(id: string, worktreePath: string, args: string[]): void {
  setPaneCommand(id, { args, directory: worktreePath });
  // Working from this instant, rather than from the first report that catches its spinner. The reports
  // are on a timer and there is a second or two of Claude Code starting up before the spinner exists,
  // and the sweep in between would read the pane as quiet and take the folder away from the agent.
  agentsAtWork.started(id, Date.now());
  const { slot, index } = paneFromId(id);
  logStore.log(agentStartEntry(projects[slot]?.path, index));
  shells.get(id)?.kill();
  shells.delete(id);
  spawnTerminal(id);
}

// Directories that have gone away are dropped rather than offered, so the list only holds openable projects.
table.handle('projects:recent', () =>
  readRecentPaths(recentsFile).map((entry) => projectFromPath(entry)).filter((project) => !project.missing));
// A null path opens the folder dialog; a path from the picker skips it.
table.handle('projects:open', async (screen, projectPath: string | null) => {
  if (projectPath === null) {
    // A dialog here would open on the host's desk; the other screen types the path instead.
    if (screen !== LOCAL_SCREEN) throw new Error("Type the folder's path on the host");
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) return null;
    projectPath = filePaths[0];
  }
  const picked = projectFromPath(projectPath);
  const matchIndex = slotOfProject(picked.path);
  const index = matchIndex === -1 ? projects.length : matchIndex;
  if (replacesProject(projects[index], picked)) {
    logStore.log({ level: 'info', kind: 'project', project: picked.path, message: 'opened' });
    projects[index] = picked;
    spawnProject(picked, index);
    watchProjectBoard(boards, boardLog, picked.path);
  }
  // rememberRecentPath swallows its own failures: the shells are already running, so losing the history
  // entry must not fail the open and strand them on a slot the renderer has no page for.
  if (!picked.missing) rememberRecentPath(recentsFile, picked.path);
  // The slot holds a project either way by now: it was just filled, or the path matched one that is
  // open. `picked` is only what stops the type being optional, never an answer anyone receives.
  const open = openProjects();
  sendToRenderer('projects:change', open);
  return { index, open };
});
// Closing a project. Its panes and editor are killed and forgotten, and its slot is emptied. Nothing is
// answered: whether anything was running in it was read off the panes themselves, which only the
// renderer can see, and it has already refused or gone ahead by the time this arrives.
// The worktree records naming a pane in it give that pane up, for the reason the launch above clears
// every pane on read: no shell of this project survives the close, so a record still naming pane 2
// would put a branch under a pane that is a plain shell of some other project — and would hold its
// card in flight, unable to be shipped again, with nothing left running to finish it.
table.on('projects:close', (_screen, slot: number) => {
  const closing = projects[slot];
  // A slot that holds nothing has already been closed, and there is nothing of it left to kill.
  // Answered first so a slot past the end of the list is not written into it as a hole.
  if (closing === undefined) return;
  projects[slot] = undefined;
  logStore.log({ level: 'info', kind: 'project', project: closing.path, message: 'closed' });
  boards.forget(closing.path);
  chats.stop(slot);
  for (const id of [...terminalCommands.keys()]) if (paneFromId(id).slot === slot) dropPane(id);
  // A project that never shipped a card has nothing to give up here, and setWorktrees is the one that
  // knows it: withoutPanes hands back the same records and nothing is written or sent.
  setWorktrees(withoutPanes(worktrees, closing.path));
  sendToRenderer('projects:change', openProjects());
});
// Claude Code's own session logs, read for what each project and each pane has cost. What it reads and
// when is usage-sweep.ts's; what is handed over here is the four things only main can answer.
const tokenUsage = usageSweep({
  panePids: () => new Map([...shells].map(([id, terminalProcess]) => [terminalProcess.pid, id])),
  openProjects: () => projects.flatMap((project) => (project === undefined ? [] : [project.path])),
  processTree,
  publish: (snapshot) => sendToRenderer('usage:change', snapshot),
  placed: (placement) => claudeSessions.placed(placement),
  // Held, not reported: a sweep that fails before a window has opened must not box and exit the
  // launch over a background job whose cost is already known and named — usage-sweep.ts says what it
  // is, "the numbers simply stop moving" — and failure.ts's own header says report() is not the answer
  // for a failure somebody did catch.
  sweepFailed: (error: unknown) => failures.hold(`Token figures not updated: ${failureText(error)}`),
});
tokenUsage.start();

// The manager's four cards. The place is read from the settings main holds, so a change made on the
// settings screen reaches the weather on the next read.
table.handle('markets:read', () => readMarkets(settings.weatherPlace));

// The renderer's first read. Everything after it arrives unasked on usage:change.
table.handle('usage:read', () => tokenUsage.latest());

// Read once at startup and written back whenever the layout changes or a pane's Claude session does,
// so a crash loses at most the change you were making, or half a minute of sessions.
const claudeSessions = sessionStore(table, path.join(app.getPath('userData'), 'session.json'), slotOfProject);
// The resolved shell travels with the settings, because the renderer needs to know which family of
// shell will receive a dropped path — PowerShell doubles a quote and a POSIX shell escapes it — and
// `shellCommand: ""` in the file does not say which.
table.handle('settings:read', () => ({ settings, shellCommand }));
// Answers with the newly resolved shell so the renderer never has to re-derive pickShell's precedence
// to know which family of shell a dropped path is quoted for.
table.handle('settings:write', (_screen, next: Settings) => {
  settings = next;
  // Panes already running keep the shell they started with. Nothing here kills one: there are
  // long-running jobs in them, and a settings change is not a reason to lose one.
  shellCommand = pickShell(settings, process.env, process.platform);
  writeSettings(settingsFile, settings, isMac);
  return shellCommand;
});
registerPaneChannels(table, { shells, screens: paneScreens, spawnTerminal, window: liveWindow });
// The Claude screen's sessions. chat-sessions.ts holds what one is; main hands over the way to every
// screen and which project a slot holds.
const chats = registerChatSessions(table, {
  send: (slot, event) => sendToRenderer('chat:receive', slot, event),
  projectPath: (slot) => projects[slot]?.path, environment: paneEnvironment, userData: app.getPath('userData'),
});
registerProjectFiles(table, boards, boardLog, tellOthers);

// Which page a project is open on, or -1. Two questions want it — opening a project that is already
// open, and finding the panes a review can take — and two copies of the walk would answer differently
// the day a slot means something other than an index into this array.
function slotOfProject(projectPath: string): number {
  return projects.findIndex((project) => project?.path === projectPath);
}

// The list every screen draws its tabs from, with the terminals each one has open, so a screen arriving
// at the session builds every worker before the replay of what they printed. Which session it is the
// list of travels on its own, as `host:change` from remote-ipc.ts.
const openProjects = (): OpenProjects => ({
  projects: projects.map((project) => project ?? null),
  panes: projects.map((_project, slot) => openPanes(slot)),
});
// Every screen redraws its pages from the list, so a worker opening or closing is the list again.
const panesChanged = (): void => sendToRenderer('projects:change', openProjects());

// The terminals a project has open, ascending: every pane main holds a command for, less the editor,
// whose number is below them.
function openPanes(slot: number): number[] {
  return [...terminalCommands.keys()].map(paneFromId)
    .filter((pane) => pane.slot === slot && pane.index >= MAIN_INDEX)
    .map((pane) => pane.index)
    .sort((first, second) => first - second);
}

// A worker that is a plain shell in the project, at the lowest number going.
function openWorker(slot: number): number {
  const index = nextPaneIndex(openPanes(slot));
  const id = terminalId(slot, index);
  setPaneCommand(id, { args: [], directory: projects[slot]?.path ?? '' });
  spawnTerminal(id);
  return index;
}

// What a pane runs from now on. A pane is open while it has a command, so one that had none is a worker
// opening, and every screen is told before its first byte arrives, or the byte has no pane to land in.
function setPaneCommand(id: string, command: PaneCommand): void {
  const opening = !terminalCommands.has(id);
  terminalCommands.set(id, command);
  if (opening) panesChanged();
}

// One pane let go of for good. Out of the map before the kill: the exit arrives afterwards and is
// dropped by the check in spawnTerminal, so no pty:exit goes out for a pane already off the screen.
function dropPane(id: string): void {
  const terminalProcess = shells.get(id);
  shells.delete(id);
  terminalProcess?.kill();
  terminalCommands.delete(id);
  paneScreens.drop(id);
  screenCopies.delete(id);
  paneShells.delete(id);
}

// A worker closed on purpose. A card's record naming it gives it up, so the card is not counted as
// sitting in a pane that is gone.
function closeWorker(id: string): void {
  const { slot, index } = paneFromId(id);
  dropPane(id);
  takePane(projects[slot]?.path ?? '', index, '');
  panesChanged();
}

// The pane may still be named by another card's record, whose agent has exited and left it in that
// worktree. Taking the pane — for a card, a worker, or to close it — is what ends that claim, so the old
// record gives it up here: one record per pane in this project. claimsPane holds why the project half
// matters. `cardId` is the card taking it, whose own record is left alone.
function takePane(projectPath: string, index: number, cardId: string): void {
  const claimed = claimsPane(worktrees, projectPath, index, cardId);
  if (claimed) recordWorktree(withoutPane(claimed));
}

// The key and the button under the worker list. A project with no folder has no panes to add to.
table.handle('pane:add', (_screen, slot: number) => {
  if (projects[slot] === undefined || projects[slot].missing) return null;
  return { index: openWorker(slot), open: openProjects() };
});

function recordWorktree(entry: WorktreeEntry): WorktreeEntry {
  setWorktrees(withEntry(worktrees, entry));
  return entry;
}

// The lowest-numbered worker of this project that nobody is using, or the number a new one would get
// when every worker is taken: workers are opened as they are needed, so there is always one going.
// What counts as free is shipCanTake's.
function freePaneIn(slot: number): number {
  return freePane(paneReadingsIn(slot), shipCanTake) ?? nextPaneIndex(openPanes(slot));
}

// Every open terminal of the project as pane-reading.ts reads them.
function paneReadingsIn(slot: number): PaneReading[] {
  const projectPath = projects[slot]?.path;
  return openPanes(slot).map((index): PaneReading => {
    const id = terminalId(slot, index);
    const command = terminalCommands.get(id);
    return {
      index,
      foreground: foregroundOf(id),
      shell: paneShells.get(id),
      command,
      inWorktree: command !== undefined && command.directory !== projectPath,
    };
  });
}

// Give the worktree a pane: a free worker, or a new one. Split out because it is also the whole of a
// second ship of a card whose worktree exists but never got one.
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
  const pane = freePaneIn(slot);
  takePane(entry.projectPath, pane, entry.cardId);
  startAgent(terminalId(slot, pane), entry.worktreePath, agentArguments(shellCommand, prompt));
  return { ok: true, entry: recordWorktree({ ...entry, pane }) };
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
  shellLivesIn,
  removeWorktree,
  addWorktree: (entry) => git(['worktree', 'add', entry.worktreePath, entry.branch], entry.projectPath),
  startReview: (entry, slot, prompt) => attachPane(recordWorktree(entry), slot, prompt),
  queue: shipInProject,
  // Through the move log, so the watcher's read-back finds the board it already holds and does not
  // log the sweep's own move as the `board` command's.
  writeBoard: (projectPath, board) => boardLog.wrote(projectPath, board, () => writeBoard(projectPath, board)),
});

// A card moved into Ship. Every step of it is ship-flow.ts's; what is handed over here is the records
// and the panes, which only this file holds.
const shipCard = shipFlow({
  worktrees: () => worktrees,
  recordWorktree,
  attachPane,
  agentRunsIn,
  dropDeadWorktrees,
  forgetReview: (cardId) => reviews.forget(cardId),
  queue: shipInProject,
});
table.handle('worktree:create', async (_screen, request: ShipRequest) => {
  const result = await shipCard(request);
  logStore.log(shipEntry(request, result));
  return result;
});

// The renderer's first read, and the worktree dialog's own on the way open — the one screen that wants
// a sweep run right now rather than on the next tick. Everything else arrives on worktree:change.
table.handle('worktree:list', () => {
  dropDeadWorktrees();
  return worktreeList();
});

// A channel of its own rather than riding along on worktree:list and worktree:change, which reach the
// renderer at launch and after every ship, removal and project close. A `git status` per worktree
// behind all of those would be that many process spawns for an answer only the worktree dialog shows.
//
// worktreeState is git's own answer rather than the ship's narrower one, because git is what refuses
// the removal this row's `d` is about to ask for. Run concurrently — this is main, and every pane's
// bytes flow through it.
table.handle('worktree:check', async () => {
  const results = await Promise.all(worktrees.map(async (entry) => (
    { worktreePath: entry.worktreePath, ...await worktreeState(entry.worktreePath) }
  )));
  return {
    dirty: results.filter((result) => result.dirty).map((result) => result.worktreePath),
    unreadable: results.filter((result) => result.unreadable).map((result) => result.worktreePath),
  };
});

// Every worktree git knows of in each project, for the manager. worktree-scan.ts says what is in it.
table.handle('worktree:scan', (_screen, projectPaths: string[]) => (
  scanWorktrees(projectPaths, worktrees)
));

// Refused once for a dirty worktree, and only once: the changes in it exist nowhere else, so the
// question is worth asking, and refusing forever would mean the only way out is the command line.
//
// A function rather than only a handler, because the review takes the same step: a card whose agent
// has finished has its worktree thrown away before a fresh one is made on the branch.
//
// `projectPath` is for a worktree the app has no record of — one the manager found through git — and
// is the project to ask git from. A recorded worktree is asked from the project its record names.
async function removeWorktree(worktreePath: string, force: boolean, projectPath?: string): Promise<WorktreeRemoval> {
  const entry = entryForPath(worktrees, worktreePath);
  const project = entry?.projectPath ?? projectPath;
  // A path with no record and no project is the removal having already happened — the sweep dropped it
  // while the dialog's question was on screen, or a second `d` landed on a row that had gone. There is
  // nothing to remove and no project to ask git from, and the goal state already holds, so this
  // answers yes rather than refusing. Refusing sends the dialog down its failure path and offers to
  // force-delete a folder that is not there.
  if (!project) return { ok: true, message: '', dirty: [] };
  removingWorktrees.add(worktreePath);
  try {
    // A folder deleted by hand cannot be asked whether it is dirty: git is spawned into a cwd that is
    // not there, and node fails with `spawn git ENOENT` — its own failure to start a process, which
    // read as the reason your removal was refused and told you nothing you could act on. Nothing is at
    // risk in a folder that is gone, and git's own unforced remove is happy to prune a worktree whose
    // folder has vanished, so the question is skipped rather than asked and lost.
    //
    // changedFiles, not blockingChanges: this refusal exists to ask before git does, and git counts
    // .dashboard/ like any other folder. Ask the ship's narrower question here and a worktree holding
    // nothing but an uncommitted board move sails past, straight into git saying no in its own words.
    const dirty = existsSync(worktreePath)
      ? changedFiles(await git(['status', '--porcelain'], worktreePath))
      : [];
    if (dirty.length > 0 && !force) return { ok: false, message: '', dirty };
    await git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], project);
    forgetSize(worktreePath);
    // A worktree with no record has no agent of the app's in it, so a shell of yours standing there is
    // left alone.
    if (!entry) return { ok: true, message: `removed ${baseName(worktreePath)}`, dirty: [] };
    // The agent goes with the folder it was working in: leaving it running leaves it writing into a
    // directory git has just deleted. Only here, where the folder was deleted on purpose.
    for (const id of shellsIn(worktreePath)) shells.get(id)?.kill();
    releaseWorktreePanes(entry);
    setWorktrees(withoutWorktree(worktrees, worktreePath));
    return { ok: true, message: `removed ${entry.branch}`, dirty: [] };
  } catch (error: unknown) {
    return {
      ok: false,
      message: `not removed: ${failureText(error)}`,
      dirty: [],
    };
  } finally {
    // In a finally, so a removal that throws part way cannot hold a dead record past the sweep for the
    // rest of the run.
    removingWorktrees.delete(worktreePath);
  }
}

table.handle('worktree:remove', async (_screen, worktreePath: string, force: boolean, projectPath: string) => {
  const result = await removeWorktree(worktreePath, force, projectPath);
  logStore.log(removalEntry(projectPath, worktreePath, result));
  return result;
});

// The command screen. What it does with the processes it spawns is task-runner.ts's; what is handed
// over here is only what this file knows — the way to the renderer, and the shell the settings screen
// last picked.
const tasks = registerTasks(table, { send: (result) => sendToRenderer('task:update', result), shellCommand: () => shellCommand });

// The `session` command. Every decision is session-requests.ts's; what is handed over here is the panes
// and the git that only main holds. Git runs on the project's queue, the one ships and reviews hold.
const sessions = listenForSessions(sessionSocket, sessionRequests({
  slotOf: (directory) => projectOfFolder(projects.map((project) => project?.path), directory, realPath),
  projectPath: (slot) => projects[slot]?.path,
  openPanes,
  agentIn: (id) => runsAnAgent(terminalCommands.get(id)),
  busyWith(id) {
    const { slot, index } = paneFromId(id);
    const reading = paneReadingsIn(slot).find((pane) => pane.index === index);
    return reading !== undefined && paneIsBusy(reading) ? programIn(reading) : null;
  },
  directoryOf: (id) => terminalCommands.get(id)?.directory,
  shellCommand: () => shellCommand,
  openWorker,
  // A card's worker is the card's agent from here on, so its record names the pane, the way a ship's does,
  // and the card's last review is over, both halves of it as a ship clears them: left marked, the fix
  // this worker pushes would never be reviewed.
  startWorker(id, directory, args, cardId) {
    const entry = cardId === null ? undefined : entryForCard(worktrees, cardId);
    const { slot, index } = paneFromId(id);
    takePane(projects[slot]?.path ?? '', index, cardId ?? '');
    if (entry) reviews.forget(entry.cardId);
    if (entry) recordWorktree({ ...entry, pane: index, reviewing: false });
    startAgent(id, directory, args);
  },
  closeWorker,
  mark: (id, state) => sendToRenderer('pane:mark', id, state),
  cardWorktree(projectPath, cardId) {
    const entry = entryForCard(worktrees, cardId);
    if (entry?.projectPath !== projectPath) return undefined;
    return { worktreePath: entry.worktreePath, working: agentRunsIn(slotOfProject(projectPath), entry.pane) };
  },
  makeWorktree: (projectPath, title) => shipInProject(projectPath, () => makeThrowawayWorktree(projectPath, title)),
  unfinished: (worktreePath) => unfinishedWork(runProgram, worktreePath),
  // The worktree dialog's own removal, so a folder deleted by hand and a sweep landing mid-removal are
  // handled the one way. Unforced: unfinishedWork has already said there is nothing in it to lose.
  removeWorktree: (worktreePath, projectPath) => shipInProject(projectPath, async () => {
    const removal = await removeWorktree(worktreePath, false, projectPath);
    if (!removal.ok) throw new Error(removal.message || `${worktreePath} has changes`);
  }),
}), (error) => failures.hold(`The session command cannot reach this app: ${failureText(error)}`));

function createWindow(): void {
  mainWindow = openAppWindow({
    background: settings.theme.background,
    // One last reading before the shells die, so a conversation started or cleared since the last sweep
    // is the one the next launch resumes. A reading that fails still quits, on the last sweep's.
    async beforeQuit() {
      const placement = await tokenUsage.placeNow().catch(() => null);
      if (placement !== null) claudeSessions.placed(placement);
    },
    loaded: () => failures.drain(),
  });
  // Last, so a throw anywhere above is still the launch failing rather than a message sent to a window
  // that was never finished.
  failures.windowOpened();
}

// This machine's session, as the host serves it to a remote screen and as the local window gets it back
// on leaving another host.
const held: HeldByMain = {
  table, screenCopies, shells, screens: paneScreens, version: app.getVersion(), settings: () => settings,
  projects: openProjects, worktrees: worktreeList, usage: tokenUsage.latest, log: (draft) => logStore.log(draft), hold: failures.hold,
};
// Local window only: a pushed pane of the host this screen joined is not this app's own to rebroadcast.
const remote = registerRemote(held, {
  send: (channel, ...payload) => liveWindow()?.webContents.send(channel, ...payload),
  saveSettings(next) { settings = next; writeSettings(settingsFile, settings, isMac); },
});
// Before registerWithIpc, which only answers the channels already in the table.
connectAtLaunch(process.argv, () => settings, table, failures.hold);
registerWithIpc(table, remote.current);
const remoteHost = startHost(held);

app.on('ready', () => {
  logStore.log({ level: 'info', kind: 'app', message: `started v${app.getVersion()}` });
  createWindow();
});
app.on('will-quit', () => {
  remoteHost?.close();
  sessions.close();
  // The socket's own folder, which session-socket.ts made for this run; Windows has a pipe and no folder.
  if (process.platform !== 'win32') rmSync(path.dirname(sessionSocket), { recursive: true, force: true });
  logStore.log({ level: 'info', kind: 'app', message: 'quit' });
  for (const shellProcess of shells.values()) shellProcess.kill();
  chats.stopAll();
  // The transcripts this run put in the temp folder go with it, rather than sitting there until
  // something else tidies up.
  dropScrollbackFiles();
  // A task child is spawned detached, in a process group of its own, so it outlives the app unless it
  // is killed here as well — five `npm test` runs still burning CPU with no window naming them.
  tasks.stop();
});
app.on('window-all-closed', () => app.quit());
