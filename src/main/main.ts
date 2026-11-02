import { app, BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { existingProjects, pickedFolder, projectFromPath, readRecentPaths, RECENTS_FILE, rememberRecentPath, replacesProject } from './app/projects';
import { baseName } from '../shared/app/base-name';
import { git, runProgram } from './app/git';
import { realPath } from './ship/worktree-scan';
import { registerWorktreeChannels } from './ship/worktree-channels';
import { shellDirectories, shellLiveness } from './panes/shell-directory-lookup';
import { processTree } from './panes/process-tree';
import { launchPaneHost, paneHost } from './panes/pane-host-client';
import { paneHostSocket, paneOfKey } from './panes/pane-host-protocol';
import { diesAtQuit, paneShells } from './panes/pane-shells';
import { adoptedPane } from './panes/adopted-pane';
import { agentArguments, agentResumeArguments, pickShell } from '../shared/panes/shell';
import { registerTasks } from './manager/task-runner';
import { openAppWindow } from './app/app-window';
import { EDITOR_INDEX, MAIN_INDEX, isWorker, paneFromId, paneLabel, terminalId } from '../shared/panes/terminals';
import { nextPaneIndex } from '../shared/panes/pane-layout';
import { workerResumeArguments } from './workers/dispatch';
import { projectOfFolder, sessionRequests } from './workers/session-requests';
import { projectRequests } from './projects/project-requests';
import { MANAGER_FOLDER, projectInSlot, sessionSlot } from './manager/manager-terminals';
import { projectNamedInFile } from './projects/project-named';
import { MANAGER_SLOT } from '../shared/manager/manager';
import { listenForSessions, sessionSocketFolder, sessionSocketPath } from './workers/session-socket';
import { unfinishedWork } from './workers/finished-work';
import { makeThrowawayWorktree } from './ship/branch-worktree';
import { folderDialogRefusal, screens, windowHears } from '../shared/remote-host/screens';
import { boardChanges } from './board/board-changes';
import { peekBoard, writeBoard } from './board/board-store';
import { readMarket } from './markets/markets-fetch';
import { boardWatchers } from './board/board-watch';
import { failureReporter, failureText } from '../shared/errors/failure';
import { dropWrittenFiles } from './nvim/nvim-remote';
import { registerPaneChannels } from './panes/pane-channels';
import { registerChatSessions } from './chat/chat-sessions';
import { startsAtOpen } from './chat/chat-start';
import { startHost, type HeldByMain } from './remote-host/host-wiring';
import { connectAtLaunch, registerRemote } from './remote-host/remote-ipc';
import { registerPaneOpeners } from './panes/pane-openers';
import { registerWorkerChannels } from './workers/worker-channels';
import { channels, registerWithIpc } from './app/channels';
import { agentStartEntry, paneExitEntry } from '../shared/app/log-entry';
import { registerLog } from './app/log-ipc';
import { registerProjectFiles, watchProjectBoard } from './app/project-files-ipc';
import { SESSION_FILE } from './app/session';
import { sessionIndexStore } from './workers/session-index-store';
import { registerDrawer } from './drawer/drawer-ipc';
import { sessionStore } from './app/session-store';
import { agentToResume, mainResume, resumedAs, resumeLine, type PaneConversation } from './workers/claude-resume';
import { workingPanes, WORKING_REPORT_MS } from '../shared/panes/working-panes';
import { keepHostToken } from './remote-host/host-token';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings/settings-store';
import { oneAtATime } from './ship/ship';
import {
  freePane,
  paneIsBusy,
  programIn,
  runsAnAgent,
  shipCanTake,
  type PaneCommand, type PaneReading, type PaneUse,
} from '../shared/panes/pane-reading';
import { usageSweep } from './usage/usage-sweep';
import {
  claimsPane,
  entryForCard,
  livingEntries,
  readWorktrees,
  withEntry,
  withoutPane,
  panesAtLaunch,
  withoutPanes,
  writeWorktrees,
} from './ship/worktree-store';
import type { Settings } from '../shared/settings/settings';
import { reviewSweep } from './ship/review-flow';
import { worktreeKeeper } from './ship/worktree-keeper';
import { shipFlow } from './ship/ship-flow';
import type { OpenProjects, ProjectOpen, ShipResult, Project, WorktreeEntry } from '../shared/app/bridge';
import { unpacked } from './app/unpacked';

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
// What a slot starts its shells and session in, the manager's folder included. manager-terminals.ts
// says what the manager is to main.
const projectIn = (slot: number): Project | undefined => projectInSlot(projects, slot);
// The recently opened projects live next to the app's other per-user state.
const recentsFile = path.join(app.getPath('userData'), RECENTS_FILE);
const worktreesFile = path.join(app.getPath('userData'), 'worktrees.json');
// Dropped on read, so a worktree removed by hand outside the app does not leave its card marked as in
// flight forever with nothing able to clear it.
//
// Every pane comes back null with it. A shell the pane host kept is put back in its pane when its
// project opens, and adoptSurvivors names it on its card again; any other pane is a plain shell in
// the project a moment after launch, and a record
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
let recordAtLaunch: WorktreeEntry[] = [];
// The pane each card's agent was in when the app last ran, kept from before the clearing so a restart
// resumes the agent in that pane and nowhere else. agentToResume holds why.
let agentPanesBeforeLaunch = new Map<string, number>();
try {
  const recorded = livingEntries(readWorktrees(worktreesFile), existsSync);
  ({ entries: recordAtLaunch, panes: agentPanesBeforeLaunch } = panesAtLaunch(recorded));
} catch (error: unknown) {
  dialog.showErrorBox(
    'Dashboard cannot read its worktree record',
    `${worktreesFile}\n\n${failureText(error)}\n\nNothing has been changed. Open Dashboard again once that file can be read.`,
  );
  app.exit(1);
}
// Outside the try: a failed write is worktree-store's to swallow, and inside it would read as a write
// that can stop the launch.
writeWorktrees(worktreesFile, recordAtLaunch);
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
// How big each pane is, last the renderer measured it. Kept for the panes that have no shell right
// now as much as for the ones that do, since a pty is spawned here and the window it draws into is
// only visible on the other side of the wire. sizeOfPane is where the rule lives.
const paneScreens = screens();
// The `board` command, handed to every pane as DASHBOARD_BOARD so an agent in any project can move
// its own card without hand-editing JSON. .dashboard/CLAUDE.md is where it is documented, and that
// file is seeded into every project the app touches.
//
// Unpacked, because node is what runs it and node cannot read a file inside an asar. In a packaged
// app getAppPath() ends in app.asar and forge puts this one file in app.asar.unpacked beside it.
const boardCommand = unpacked(path.join(app.getAppPath(), '.vite', 'build', 'board-cli-entry.js'));
// The `session` command, built and unpacked the same way, and the socket it reaches this app on.
// session-socket.ts says why the socket is this run's own.
const sessionCommand = path.join(path.dirname(boardCommand), 'session-cli-entry.js');
// The `dashboard` command, both of the above behind one entry. DASHBOARD_BOARD and DASHBOARD_SESSION
// stay, since skills and worker hooks call them by name.
const dashboardCommand = path.join(path.dirname(boardCommand), 'dashboard-cli-entry.js');
const sessionSocket = sessionSocketPath(process.platform, app.getPath('temp'), process.pid);
// Built once. Every pane gets the same one, and cloning the whole environment per pane is a clone per
// pane opened for a value that never changes.
const paneEnvironment = {
  ...process.env,
  DASHBOARD_COMMAND: dashboardCommand,
  DASHBOARD_BOARD: boardCommand,
  DASHBOARD_SESSION: sessionCommand,
  DASHBOARD_SOCKET: sessionSocket,
  // Where session.json and recents.json are, for `dashboard project init`.
  DASHBOARD_USER_DATA: app.getPath('userData'),
} as Record<string, string>;
// Where every pane's shell runs, so it outlives this process: pane-host-client.ts and panes-decision-1.
// Built and unpacked beside the commands above, since `node` is what runs it.
const paneHostEntry = path.join(path.dirname(boardCommand), 'pane-host-entry.js');
const paneSocket = paneHostSocket(app.getPath('userData'));
const shellHost = paneHost({
  socket: paneSocket,
  launch: () => launchPaneHost(process.env.SHELL, paneHostEntry, paneSocket, app.getPath('home')),
  lost: failures.hold,
});
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
// Every pane's shell, pane-shells.ts's to spawn and listen to.
const panes = paneShells({
  host: shellHost, commands: terminalCommands, screens: paneScreens, environment: paneEnvironment,
  temporary: app.getPath('temp'), shellCommand: () => shellCommand, projectPath: (slot) => projectIn(slot)?.path,
  send: sendToRenderer,
  ended(id, exitCode) {
    const { slot, index } = paneFromId(id);
    logStore.log(paneExitEntry(projectIn(slot)?.path, index, exitCode, agentRunsIn(slot, index)));
    releaseAgentPane(id);
  },
});
const { shells, screenCopies } = panes;

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
  return slot === -1 ? [] : paneUsesIn(slot);
});
function paneUsesIn(slot: number): PaneUse[] {
  return paneReadingsIn(slot)
    .map((pane) => ({ ...pane, exited: !shells.has(terminalId(slot, pane.index)) }));
}

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
  mainsWorkers.delete(id);
  const command = terminalCommands.get(id);
  if (!runsAnAgent(command)) return;
  terminalCommands.set(id, { args: [], directory: command.directory });
  // The record goes on naming the pane: the worktree list's Enter takes you to the pane its card was
  // shipped into, and the pane is still there. The claim ends where the pane is taken, in attachPane.
}

// The record after launch: every change to it, the sweep that drops dead ones and a removal.
// worktree-keeper.ts holds each; what is handed over here is what only this file has.
const worktrees = worktreeKeeper({
  file: worktreesFile,
  entries: recordAtLaunch,
  commands: terminalCommands,
  shells,
  announce: (list) => sendToRenderer('worktree:change', list),
});

// shell-directory-lookup.ts says what asking a shell where it is means.
const shellLivesIn = shellLiveness({
  shells, opened: terminalCommands, shellsIn: worktrees.shellsIn, ask: shellDirectories(processTree),
});

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
    worktrees.dropDead();
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
    return { pid: shells.get(id)?.pid, startDirectory: terminalCommands.get(id)?.directory, projectPath: projectIn(slot)?.path };
  },
});

// A project opens with its main session, plus a worker for each pane that was running Claude Code when
// the app last quit — session-store.ts says when it was. Whether the conversation saved for pane 0 is
// main's to carry on is mainResume's; one that was not main's comes back in a worker after the rest.
// The editor is registered but not started: opening nine projects should not launch nine editors, each
// with its own swap files, that you never asked for.
function spawnProject(project: Project, projectIndex: number): void {
  if (project.missing) return;
  adoptSurvivors(projectIndex, project.path);
  const mainId = terminalId(projectIndex, MAIN_INDEX);
  const first = mainResume(claudeSessions.takeResume(project.path, MAIN_INDEX, mainId), project.path, realPath);
  // Main is the Claude screen in the terminals view's left column, run through the Agent SDK, not a pane.
  // It starts when first shown, unless one of its workers comes back below (chat-start.ts).
  chats.open(projectIndex, first.session);
  for (const index of claudeSessions.owedResumes(project.path)) {
    const id = terminalId(projectIndex, index);
    const owed = claudeSessions.takeResume(project.path, index, id);
    terminalCommands.set(id, { args: [], directory: project.path });
    if (owed !== null) resumeIn(id, project.path, index, owed);
  }
  if (first.worker) {
    const id = terminalId(projectIndex, nextPaneIndex(openPanes(projectIndex)));
    terminalCommands.set(id, { args: [], directory: project.path });
    claudeSessions.moveResume(mainId, id);
    resumeIn(id, project.path, MAIN_INDEX, first.worker);
  }
  terminalCommands.set(terminalId(projectIndex, EDITOR_INDEX), { args: 'editor', directory: project.path });
  if (startsAtOpen(projectIndex, mainsWorkers)) chats.start(projectIndex);
}

// The shells the pane host kept for this project through a restart, back in their panes as they were.
// adopted-pane.ts says what each comes back as. Before the resumes, which skip the panes taken here.
function adoptSurvivors(slot: number, projectPath: string): void {
  for (const { survivor, shell } of shellHost.adopt(projectPath)) {
    const { index } = paneOfKey(survivor.key);
    const id = terminalId(slot, index);
    const saved = claudeSessions.takeResume(projectPath, index, id);
    const pane = adoptedPane(survivor, saved, worktrees.entries(), agentPanesBeforeLaunch, realPath);
    if (pane === undefined) {
      shell.kill();
      continue;
    }
    setPaneCommand(id, pane.command);
    panes.listenTo(id, shell, survivor.file);
    if (pane.card !== undefined) recordWorktree({ ...pane.card, pane: index });
    if (pane.worker) mainsWorkers.add(id);
  }
}

// A session that ran as a card's agent comes back as it, exactly as the ship started it; agentToResume
// says which sessions those are. Its record names the pane again, so the status bar prints the branch,
// a second ship of the card is refused, and the review sweep waits for it rather than starting beside
// it. A worker main dispatched comes back as main's again; resumedAs says how each one comes back.
function resumeIn(id: string, projectPath: string, savedIndex: number, resume: PaneConversation): void {
  const card = agentToResume(worktrees.entries(), agentPanesBeforeLaunch, resume, projectPath, savedIndex, realPath);
  const comesBackAs = resumedAs(resume, card);
  if (card !== undefined) recordWorktree({ ...card, pane: paneFromId(id).index });
  if (comesBackAs === 'shell') {
    terminalCommands.set(id, { args: [], directory: resume.directory });
    panes.spawn(id);
    shells.get(id)?.write(resumeLine(resume));
    return;
  }
  const agentArguments = comesBackAs === 'worker' ? workerResumeArguments(shellCommand, id, resume.session) : agentResumeArguments(shellCommand, resume.session);
  startAgent(id, card?.worktreePath ?? resume.directory, agentArguments);
  if (comesBackAs === 'worker') mainsWorkers.add(id);
}

// The panes main's worker is in now, which the `session` command may release and session.json marks so
// a restart knows them again. A pane leaves the set when its agent exits, anything else starts in it, or
// it closes, so release never kills what somebody else put there afterwards.
const mainsWorkers = new Set<string>();

// Point a pane at a worktree and start the agent in it. The pane keeps its id — it is still terminal
// 3 of that project — and only what it runs and where changes, which is exactly what terminalCommands
// exists to say. The old shell is killed first: retargeting a pane that is still running one would
// leave two processes writing to the same id.
//
// What it runs is the caller's, because there are three agents now: the one that works a card, the one
// that reviews the pull request the first one opened, and either of them resumed after a restart.
function startAgent(id: string, worktreePath: string, agentArguments: string[]): void {
  mainsWorkers.delete(id);
  workerAnswers.forget(id);
  setPaneCommand(id, { args: agentArguments, directory: worktreePath });
  // Working from this instant, rather than from the first report that catches its spinner. The reports
  // are on a timer and there is a second or two of Claude Code starting up before the spinner exists,
  // and the sweep in between would read the pane as quiet and take the folder away from the agent.
  agentsAtWork.started(id, Date.now());
  const { slot, index } = paneFromId(id);
  logStore.log(agentStartEntry(projectIn(slot)?.path, index));
  shells.get(id)?.kill();
  shells.delete(id);
  panes.spawn(id);
}

// Directories that have gone away are dropped rather than offered, so the list only holds openable projects.
table.handle('recent-projects:read', () => existingProjects(readRecentPaths(recentsFile)));
// A null path opens the folder dialog; a path from the picker skips it, and is refused unless it is a
// folder (pickedFolder). A refusal is answered, not thrown: a throw reaches the screen behind Electron's
// "Error invoking remote method" prefix.
table.handle('projects:open', async (screen, projectPath: string | null): Promise<ProjectOpen> => {
  // The launch's restore opens every project here, and one opened before the pane host has said what it
  // kept would start fresh shells in panes that already have one.
  await shellHost.ready;
  if (projectPath === null) {
    const refused = folderDialogRefusal(screen);
    if (refused !== null) return { refused };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) return null;
    projectPath = filePaths[0];
  }
  const folder = pickedFolder(projectPath);
  return 'refused' in folder ? folder : openProject(folder.path);
});
// A project opened from its path, unless it is open already, and the slot it is in either way. The
// picker's open, `pane claim --project` and `project open` all come here, and so should anything else
// that opens a project from main, so every way in starts its shells, watches its board and remembers
// it alike.
function openProject(projectPath: string): { index: number; open: OpenProjects } {
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
  const open = openProjects();
  sendToRenderer('projects:change', open);
  return { index, open };
}
// Closing a project. Its panes and editor are killed and forgotten, and its slot is emptied. Nothing is
// answered: whether anything was running in it was read off the panes themselves, which only the
// renderer can see, and it has already refused or gone ahead by the time this arrives.
// The worktree records naming a pane in it give that pane up, for the reason the launch above clears
// every pane on read: no shell of this project survives the close, so a record still naming pane 2
// would put a branch under a pane that is a plain shell of some other project — and would hold its
// card in flight, unable to be shipped again, with nothing left running to finish it.
table.on('projects:close', (_screen, slot: number) => closeProjectSlot(slot));
// The close itself, from the key once it has agreed or from `dashboard project close` once
// project-requests.ts has. Every screen takes the page down on the list it is sent.
function closeProjectSlot(slot: number): void {
  const closing = projects[slot];
  // A slot that holds nothing has already been closed, and there is nothing of it left to kill.
  // Answered first so a slot past the end of the list is not written into it as a hole.
  if (closing === undefined) return;
  projects[slot] = undefined;
  logStore.log({ level: 'info', kind: 'project', project: closing.path, message: 'closed' });
  boards.forget(closing.path);
  chats.stop(slot);
  for (const id of [...terminalCommands.keys()]) if (paneFromId(id).slot === slot) dropPane(id);
  // A project that never shipped a card has nothing to give up here, and worktrees.set is the one that
  // knows it: withoutPanes hands back the same records and nothing is written or sent.
  worktrees.set(withoutPanes(worktrees.entries(), closing.path));
  sendToRenderer('projects:change', openProjects());
}
// Claude Code's own session logs, read for what each project and each pane has cost. What it reads and
// when is usage-sweep.ts's; what is handed over here is the four things only main can answer.
const tokenUsage = usageSweep({
  panePids: () => new Map([...shells].map(([id, terminalProcess]) => [terminalProcess.pid, id])),
  openProjects: () => projects.flatMap((project) => (project === undefined ? [] : [project.path])),
  processTree,
  publish: (snapshot) => sendToRenderer('usage:change', snapshot),
  placed: (placement) => [claudeSessions, sessionIndex].forEach((store) => store.placed(placement)),
  // Held, not reported: a sweep that fails before a window has opened must not box and exit the
  // launch over a background job whose cost is already known and named — usage-sweep.ts says what it
  // is, "the numbers simply stop moving" — and failure.ts's own header says report() is not the answer
  // for a failure somebody did catch.
  sweepFailed: (error: unknown) => failures.hold(`Token figures not updated: ${failureText(error)}`),
});
tokenUsage.start();

// One of the manager's four cards. The place is read from the settings main holds, so a change made on
// the settings screen reaches the weather on the next read.
table.handle('markets:read', (_screen, market: unknown) => readMarket(market, settings.weatherPlace));

// The renderer's first read. Everything after it arrives unasked on usage:change.
table.handle('usage:read', () => tokenUsage.latest());

// Read once at startup and written back whenever the layout changes or a pane's Claude session does,
// so a crash loses at most the change you were making, or half a minute of sessions.
const claudeSessions = sessionStore(table, path.join(app.getPath('userData'), SESSION_FILE), slotOfProject, (id) => mainsWorkers.has(id));
// Every Claude the app starts, by project, for the drawer to list and resume.
const sessionIndex = sessionIndexStore(path.join(app.getPath('userData'), 'session-index.json'));
registerDrawer(table, {
  sessions: sessionIndex,
  projectPath: (slot) => projectIn(slot)?.path, openProjects: () => openProjects(),
  resumeInWorker(slot, session, directory) {
    const index = openWorker(slot, directory);
    shells.get(terminalId(slot, index))?.write(resumeLine({ session, directory }));
    return index;
  },
});
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
registerPaneChannels(table, { shells, screens: paneScreens, spawnTerminal: panes.spawn, window: liveWindow });
// The Claude screen's sessions. chat-sessions.ts holds what one is; main hands over the way to every
// screen and which project a slot holds.
const chats = registerChatSessions(table, {
  send: (slot, event) => sendToRenderer('chat:receive', slot, event),
  projectPath: (slot) => projectIn(slot)?.path, environment: paneEnvironment, userData: app.getPath('userData'),
  conversation: sessionIndex.mainIs, remembered: sessionIndex.mainRemembers, runningInPane: sessionIndex.inPane,
});
// The manager's main, opened at launch the way a project's is when it opens, and started the same way:
// shown, told something, or one of its workers kept through a restart. Its folder is made first, since
// a session cannot start in a folder that is not there.
try {
  mkdirSync(MANAGER_FOLDER, { recursive: true });
  chats.open(MANAGER_SLOT);
  // The manager has no project to open, so its kept shells are taken back once the host has answered.
  void shellHost.ready.then(() => {
    adoptSurvivors(MANAGER_SLOT, MANAGER_FOLDER);
    if (startsAtOpen(MANAGER_SLOT, mainsWorkers)) chats.start(MANAGER_SLOT);
  });
} catch (error: unknown) {
  failures.hold(`The manager's terminals have no folder: ${failureText(error)}`);
}
registerProjectFiles(table, boards, boardLog, tellOthers);

// Which page a project is open on, or -1. Two questions want it — opening a project that is already
// open, and finding the panes a review can take — and two copies of the walk would answer differently
// the day a slot means something other than an index into this array. Compared through realPath, as
// projectOfFolder does for the session command, so a folder opened through a symlink and named in
// projects.yaml by its real path is one project, not two pages on the same shells and board.
function slotOfProject(projectPath: string): number {
  const real = realPath(projectPath);
  return projects.findIndex((project) => project !== undefined && realPath(project.path) === real);
}

// The list every screen draws its tabs from, with the terminals each one has open, so a screen arriving
// at the session builds every worker before the replay of what they printed. Which session it is the
// list of travels on its own, as `host:change` from remote-ipc.ts.
const openProjects = (): OpenProjects => ({
  projects: projects.map((project) => project ?? null),
  panes: projects.map((_project, slot) => openPanes(slot)),
  manager: openPanes(MANAGER_SLOT),
});
// Every screen redraws its pages from the list, so a worker opening or closing is the list again.
const panesChanged = (): void => sendToRenderer('projects:change', openProjects());

// The workers a project has open, ascending: every pane main holds a command for, less the editor.
function openPanes(slot: number): number[] {
  return [...terminalCommands.keys()].map(paneFromId)
    .filter((pane) => pane.slot === slot && isWorker(pane.index))
    .map((pane) => pane.index)
    .sort((first, second) => first - second);
}

// A worker that is a plain shell in the project, at the lowest number going.
function openWorker(slot: number, directory = projectIn(slot)?.path ?? ''): number {
  const index = nextPaneIndex(openPanes(slot));
  const id = terminalId(slot, index);
  setPaneCommand(id, { args: [], directory });
  panes.spawn(id);
  return index;
}

// What a pane runs from now on. A pane is open while it has a command, so one that had none is a worker
// opening, and every screen is told before its first byte arrives, or the byte has no pane to land in.
function setPaneCommand(id: string, command: PaneCommand): void {
  const opening = !terminalCommands.has(id);
  terminalCommands.set(id, command);
  if (opening) panesChanged();
}

// One pane let go of for good.
function dropPane(id: string): void {
  mainsWorkers.delete(id);
  workerAnswers.forget(id);
  panes.drop(id);
  terminalCommands.delete(id);
  paneScreens.drop(id);
}

// A worker closed on purpose. A card's record naming it gives it up, so the card is not counted as
// sitting in a pane that is gone.
function closeWorker(id: string): void {
  const { slot, index } = paneFromId(id);
  dropPane(id);
  takePane(projectIn(slot)?.path ?? '', index, '');
  panesChanged();
}

// The pane may still be named by another card's record, whose agent has exited and left it in that
// worktree. Taking the pane — for a card, a worker, or to close it — is what ends that claim, so the old
// record gives it up here: one record per pane in this project. claimsPane holds why the project half
// matters. `cardId` is the card taking it, whose own record is left alone.
function takePane(projectPath: string, index: number, cardId: string): void {
  const claimed = claimsPane(worktrees.entries(), projectPath, index, cardId);
  if (claimed) recordWorktree(withoutPane(claimed));
}

registerWorkerChannels(table, {
  project: projectIn, openPanes, openWorker, closeWorker, openProjects,
});

function recordWorktree(entry: WorktreeEntry): WorktreeEntry {
  worktrees.set(withEntry(worktrees.entries(), entry));
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
  const projectPath = projectIn(slot)?.path;
  return openPanes(slot).map((index): PaneReading => {
    const id = terminalId(slot, index);
    const command = terminalCommands.get(id);
    return {
      index,
      foreground: panes.foregroundOf(id),
      shell: panes.startedWith.get(id),
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
  const session = sessionIndex.launched(entry.projectPath, entry.worktreePath, entry.cardId);
  startAgent(terminalId(slot, pane), entry.worktreePath, agentArguments(shellCommand, prompt, session));
  return { ok: true, entry: recordWorktree({ ...entry, pane }) };
}

// Ships in one project run one after another, never together; ship.ts says why. A review of a card in
// that project is queued behind them too: it runs `git worktree` twice in the same repository.
const shipInProject = oneAtATime();

// The other half of a ship, which runs on the tick above rather than on a keystroke. Every decision in
// it is review-flow.ts's; what is handed over here is only what this file knows — the records, the
// pages, the panes — and the two steps, which are the ones a ship already takes.
const reviews = reviewSweep({
  worktrees: worktrees.entries,
  slotOf: slotOfProject,
  agentWorksIn,
  shellLivesIn,
  removeWorktree: worktrees.remove,
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
  worktrees: worktrees.entries,
  recordWorktree,
  attachPane,
  agentRunsIn,
  dropDeadWorktrees: worktrees.dropDead,
  forgetReview: (cardId) => reviews.forget(cardId),
  queue: shipInProject,
});
registerWorktreeChannels(table, { worktrees, shipCard, log: (draft) => logStore.log(draft) });

// The command screen. What it does with the processes it spawns is task-runner.ts's; what is handed
// over here is only what this file knows — the way to the renderer, and the shell the settings screen
// last picked.
const tasks = registerTasks(table, { send: (result) => sendToRenderer('task:update', result), shellCommand: () => shellCommand });

// The `session` command. Every decision is session-requests.ts's; what is handed over here is the panes
// and the git that only main holds. Git runs on the project's queue, the one ships and reviews hold.
// `dashboard project open` and `close` come in on the same socket; project-requests.ts tells them from
// the session command's and decides them.
const folderExists = (folder: string) => !projectFromPath(folder).missing;
const workerAnswers = sessionRequests({
  slotOf: (directory) => sessionSlot(projectOfFolder(projects.map((project) => project?.path), directory, realPath), directory, realPath),
  projectPath: (slot) => projectIn(slot)?.path,
  openSlots: () => [MANAGER_SLOT, ...projects.keys()].flatMap((slot) => {
    const project = projectIn(slot);
    return project === undefined ? [] : [{ slot, name: project.name }];
  }),
  findProject: projectNamedInFile,
  folderExists,
  openProject: (folder) => openProject(folder).index,
  openPanes,
  agentIn: (id) => runsAnAgent(terminalCommands.get(id)),
  busyWith(id) {
    const { slot, index } = paneFromId(id);
    const reading = paneReadingsIn(slot).find((pane) => pane.index === index);
    return reading !== undefined && paneIsBusy(reading) ? programIn(reading) : null;
  },
  directoryOf: (id) => terminalCommands.get(id)?.directory,
  mainsWorkerIn: (id) => mainsWorkers.has(id),
  shellCommand: () => shellCommand,
  openWorker,
  newSession: sessionIndex.launched,
  // A card's worker is the card's agent from here on, so its record names the pane, the way a ship's does,
  // and the card's last review is over, both halves of it as a ship clears them: left marked, the fix
  // this worker pushes would never be reviewed.
  startWorker(id, directory, agentArguments, cardId) {
    const entry = cardId === null ? undefined : entryForCard(worktrees.entries(), cardId);
    const { slot, index } = paneFromId(id);
    takePane(projectIn(slot)?.path ?? '', index, cardId ?? '');
    if (entry) reviews.forget(entry.cardId);
    if (entry) recordWorktree({ ...entry, pane: index, reviewing: false });
    startAgent(id, directory, agentArguments);
    mainsWorkers.add(id);
  },
  closeWorker,
  mark: (id, state) => sendToRenderer('pane:mark', id, state),
  tell: chats.tell,
  cardWorktree(projectPath, cardId) {
    const entry = entryForCard(worktrees.entries(), cardId);
    if (entry?.projectPath !== projectPath) return undefined;
    return { worktreePath: entry.worktreePath, working: agentRunsIn(slotOfProject(projectPath), entry.pane) };
  },
  makeWorktree: (projectPath, title) => shipInProject(projectPath, () => makeThrowawayWorktree(projectPath, title)),
  unfinished: (worktreePath) => unfinishedWork(runProgram, worktreePath),
  // The worktree dialog's own removal, so a folder deleted by hand and a sweep landing mid-removal are
  // handled the one way. Unforced: unfinishedWork has already said there is nothing in it to lose.
  removeWorktree: (worktreePath, projectPath) => shipInProject(projectPath, async () => {
    const removal = await worktrees.remove(worktreePath, false, projectPath);
    if (!removal.ok) throw new Error(removal.message || `${worktreePath} has changes`);
  }),
});
// The workers each main ran, for its status line and workers popup (worker-roster.ts).
table.handle('workers:read', () => workerAnswers.workers());
const answerSession = projectRequests({
  slotOf: slotOfProject,
  missingIn: (slot) => projects[slot]?.missing === true,
  folderExists,
  open: openProject,
  // Named the way the close key names them, less any name you gave a pane: those are the screen's.
  panesOf: (slot) => paneUsesIn(slot).map((use) => ({ ...use, name: paneLabel(use.index) })),
  close: closeProjectSlot,
}, workerAnswers);
// Every answer waits for the pane host, for the reason projects:open does: `project open` and
// `pane claim --project` open projects too.
const sessions = listenForSessions(
  sessionSocket,
  (request) => shellHost.ready.then(() => answerSession(request)),
  (error) => failures.hold(`The session command cannot reach this app: ${failureText(error)}`),
);

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
    shellsDieAtQuit: panes.workDiesAtQuit,
  });
  // Last, so a throw anywhere above is still the launch failing rather than a message sent to a window
  // that was never finished.
  failures.windowOpened();
}

// This machine's session, as the host serves it to a remote screen and as the local window gets it back
// on leaving another host.
const held: HeldByMain = {
  table, screenCopies, shells, screens: paneScreens, version: __BUILD_VERSION__, settings: () => settings,
  projects: openProjects, worktrees: worktrees.list, usage: tokenUsage.latest, log: (draft) => logStore.log(draft), hold: failures.hold,
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
  app.setAboutPanelOptions({ applicationVersion: __BUILD_VERSION__ });
  logStore.log({ level: 'info', kind: 'app', message: `started v${__BUILD_VERSION__}` });
  createWindow();
});
app.on('will-quit', () => {
  remoteHost?.close();
  sessions.close();
  // The socket's own folder, which session-socket.ts made for this run.
  const socketFolder = sessionSocketFolder(process.platform, sessionSocket);
  if (socketFolder !== null) rmSync(socketFolder, { recursive: true, force: true });
  logStore.log({ level: 'info', kind: 'app', message: 'quit' });
  // The pane host's shells stay up for the next launch to take back; only one this process runs itself
  // dies with it.
  for (const shellProcess of shells.values()) if (diesAtQuit(shellProcess)) shellProcess.kill();
  chats.stopAll();
  // The transcripts this run put in the temp folder go with it, rather than sitting there until
  // something else tidies up.
  dropWrittenFiles();
  // A task child is spawned detached, in a process group of its own, so it outlives the app unless it
  // is killed here as well — five `npm test` runs still burning CPU with no window naming them.
  tasks.stop();
});
app.on('window-all-closed', () => app.quit());
