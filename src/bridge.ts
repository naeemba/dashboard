import type { ModelInfo, PermissionResult, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import type { ChatPreferences, ChatSessions, ChatState } from './chat-sessions';
import type { CommandRow } from './chat-commands';
import type { PdfRead } from './chat-pdf';
import type { RewindChoice, RewindPoint } from './chat-rewind';
import type { ChatMeasure } from './chat-status';
import type { ChatEvent, ImageType } from './chat-transcript';
import type { ScannedWorktree } from './git-worktrees';
import type { Project } from './projects';
import type { Board } from './board';
import type { FileLink } from './file-links';
import type { MarketsSnapshot } from './markets';
import type { Handover } from './nvim-remote';
import type { PaneUse } from './pane-reading';
import type { WorkerState } from './session-cli';
import type { BoardRead } from './board-store';
import type { Session } from './session';
import type { LogDraft, LogEntry, LogRead } from './log-entry';
import type { Settings } from './settings';
import type { TaskResult } from './tasks';
import type { UsageSnapshot } from './usage';
import type { WorktreeEntry } from './worktree-store';

// Each slot's project, and the terminals it has open — main first, then its workers — by number. One
// list for both, because a worker opening or closing is a change to what every screen has to draw.
export type OpenProjects = { projects: (Project | null)[]; panes: number[][] };

// What the board hands main when a card is moved into Ship. The slot is the project's page, which is
// what says whose workers are candidates for the agent.
export type ShipRequest = { projectPath: string; cardId: string; title: string; slot: number };
export type ShipResult = { ok: true; entry: WorktreeEntry } | { ok: false; message: string };

// What a removal answers. `dirty` is the files in the way when the answer is no, so the dialog can ask
// a second time naming them rather than deciding on its own what "dirty enough" means. Named here
// rather than written out at each use, because three places hold it now: main, the review that takes
// the same step, and the bridge below.
export type WorktreeRemoval = { ok: boolean; message: string; dirty: string[] };

// Everything in flight, and the folder each pane's shell was started in, keyed by terminal id. The
// folders ride along with the records because the status bar's question is the two of them together:
// is the pane I am in one of these checkouts. Only main knows where a pane is, so one message carries
// both; which moments send one is setWorktrees' in main.ts to say.
export type WorktreeList = { entries: WorktreeEntry[]; paneDirectories: Record<string, string> };

export type DashboardBridge = {
  platform: string;
  getRecentProjects(): Promise<Project[]>;
  openProject(projectPath: string | null): Promise<{ index: number; open: OpenProjects } | null>;
  onProjectsChange(listener: (open: OpenProjects) => void): void;
  // Join another Dashboard's session, or go back to this one. Resolves '' or the host's refusal.
  connectHost(address: string, token: string): Promise<string>;
  disconnectHost(): Promise<void>;
  onHostReport(listener: (text: string) => void): void;
  // Which session the window shows: the joined host's address, or LOCAL_SCREEN for this machine's own.
  // Said before that session's list arrives, so the pages of the one before are taken down first.
  onHostChange(listener: (host: string) => void): void;
  // Closing a project: its shells and its editor are killed and its slot is given up. The page is
  // the renderer's to take off the screen; nothing comes back, because there is nothing to answer — the
  // one thing that could refuse is read off the panes, and the renderer has already asked them.
  closeProject(slot: number): void;
  // Chrome stopped putting a path on File, so only the preload can say where a dropped file lives.
  getPathForFile(file: File): string;
  openExternal(url: string): void;
  // The banner a ringing pane raises. An OS notification belongs to main, the way openExternal does:
  // main is the side macOS knows the app by. The pane's id travels with it so a click on the banner
  // can be answered with the pane it was raised for.
  notify(title: string, body: string, paneId: string): void;
  // A click on that banner, coming back with the id it was raised for.
  onNotificationClick(listener: (paneId: string) => void): void;
  // Ctrl+`: the focused pane's scrollback, on its way to the project's nvim. The text travels rather
  // than the pane's id, because only the renderer has the buffer — main has the pty, which is the
  // bytes going past, not the screen they built. The pane's own index travels too: each pane gets its
  // own file, so two of them can be read side by side. Answers ok-or-why-not, the shape shipCard and
  // removeWorktree already answer in, rather than leaving an empty string to mean it worked.
  openScrollback(slot: number, index: number, text: string): Promise<Handover>;
  // A path a pane printed, opened in the project's nvim. Main finds the file; file-open.ts holds how.
  openFile(slot: number, index: number, link: FileLink): Promise<Handover>;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  // Every pane with an agent still working in it, sent on a timer and read by the review sweep. The
  // same direction as openScrollback and for the same reason: main has the pty, which is the bytes
  // going past, not the screen they built — and "still working" is a thing you can only see on the
  // screen. Whole list each time rather than a change at a time, so a report that goes missing costs
  // one tick's answer instead of leaving a pane marked as working for the rest of the run.
  reportWorkingPanes(ids: string[]): void;
  // A project's open terminals as pane-reading.ts reads them, by pane number, the editor left out. Asked of
  // main because every field is the pty's: what it has in the foreground, and whether it is still
  // there. pane-reading.ts says what the shape is for and why the screens stopped reading it off the
  // panes themselves.
  //
  // A project main has no slot for answers with nothing. The command screen reads that as a project it
  // could not reach and names it; the close reads it as nothing to lose and goes ahead, which is what
  // an empty list means — main holds every shell, so a project it has no slot for has no shells left.
  readPanes(projectPath: string): Promise<PaneUse[]>;
  // A new worker pane on this page: a shell in the project. Answers like openProject, with the list
  // that has it on, or null for a page with no folder.
  addPane(slot: number): Promise<{ index: number; open: OpenProjects } | null>;
  // A worker pane closed for good: its shell, or whatever runs in it, is killed.
  closePane(slot: number, index: number): Promise<void>;
  // A worker's hooks saying it is waiting on a permission or has finished its turn.
  onPaneMark(listener: (id: string, state: WorkerState) => void): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string, exitCode: number) => void): void;
  getSession(): Promise<Session>;
  saveSession(session: Session): void;
  // The saved projects are open again, or have failed to. What `--remote` waits for before it joins a
  // host, so the restore's own opens are not relayed to it.
  sessionRestored(): void;
  readBoard(projectPath: string): Promise<BoardRead>;
  // A read that changes nothing on disk, for the manager's counts: null when there is nothing to
  // count. board-store.ts says why the manager may not use readBoard.
  peekBoard(projectPath: string): Promise<Board | null>;
  writeBoard(projectPath: string, board: Board): Promise<void>;
  // The project whose board.json has become something the app did not write — the `board` command
  // moving a card, or a hand edit. Main watches the file; this is how a board on screen finds out,
  // so a card an agent moves shows up without leaving the board and coming back.
  onBoardChange(listener: (projectPath: string) => void): void;
  // The project's page of notes, read and written whole. The change event is another screen's write:
  // the box is one person typing, but that person can be at either machine.
  onNotesChange(listener: (projectPath: string) => void): void;
  readNotes(projectPath: string): Promise<string>;
  writeNotes(projectPath: string, text: string): Promise<void>;
  // The settings, and the shell that was resolved from them. One call, because the renderer needs
  // both before it builds a pane and they are decided together.
  getSettings(): Promise<{ settings: Settings; shellCommand: string }>;
  // Answers with the shell main resolved from the new settings, which is the one a dropped path is
  // quoted for.
  saveSettings(settings: Settings): Promise<string>;
  // Moving a card into Ship: the worktree, the branch, the pane and the agent. Answers with the
  // record it wrote, or with the message saying which step refused and why.
  shipCard(request: ShipRequest): Promise<ShipResult>;
  // The renderer's first read, with the dead records already dropped. The worktree dialog calls it on
  // the way open for that sweep rather than for the answer — what the sweep drops comes back through
  // onWorktreeChange, which is how every change after the first one arrives.
  listWorktrees(): Promise<WorktreeList>;
  // The same two answers again, unasked, whenever the records change — a ship, a worktree removed, a
  // folder that went away outside the app. The pane directories ride along on that message rather than
  // sending one of their own, so a pane that moved without a record moving (a project opened into a
  // freed slot) is not news here; setWorktrees in main.ts is where that is decided and says why.
  // It is what lets a board on screen be right about a change made from somewhere else — before this
  // the renderer re-read the list on arriving at a board, so a card whose worktree went while you were
  // looking at it kept its badge until you left.
  onWorktreeChange(listener: (list: WorktreeList) => void): void;
  // Which of the current worktrees have uncommitted changes, decided by the same predicate
  // worktree:remove asks. Separate from the record itself, which reaches the renderer at launch and
  // then on every change, so a `git status` per worktree only runs for the one screen that shows the
  // answer. A worktree git cannot read comes back unreadable rather than clean.
  dirtyWorktrees(): Promise<{ dirty: string[]; unreadable: string[] }>;
  // Every worktree git knows of in these projects, recorded or not, with whether each is dirty and
  // its size on disk. The manager's list; git-worktrees.ts says what is in each answer.
  scanWorktrees(projectPaths: string[]): Promise<ScannedWorktree[]>;
  // Removing a worktree. A dirty one comes back refused, with the files listed, so the dialog can ask
  // a second time naming them rather than deciding on its own what "dirty enough" means. The project
  // is where git is asked from when the app holds no record of the worktree.
  removeWorktree(worktreePath: string, force: boolean, projectPath: string): Promise<WorktreeRemoval>;
  // One command, run in each of these projects at once, each in its own process. Not a pty and not a
  // pane: a command that borrows a shell throws away whatever was in it.
  runTask(command: string, projectPaths: string[]): void;
  // Stop whatever is still going. Every project that was stopped is named back through onTaskUpdate.
  cancelTasks(): void;
  // One per project, twice: when it starts and when it finishes. Per project rather than one answer at
  // the end, because a row still saying `running` beside four that have answered is the point of the
  // screen.
  onTaskUpdate(listener: (result: TaskResult) => void): void;
  // What each open project and each pane running an agent has cost in tokens, read out of Claude
  // Code's own session logs. Read once on the way up and then pushed every half minute, the way the
  // worktree records are: the numbers move on their own while nothing on screen does.
  readUsage(): Promise<UsageSnapshot>;
  // The manager's four cards, fetched by main. Never rejects: a source that failed is a failed reading
  // inside the snapshot, so the other cards still draw.
  readMarkets(): Promise<MarketsSnapshot>;
  onUsageChange(listener: (usage: UsageSnapshot) => void): void;
  // One line about something that broke on main's side of the wire. What reaches here and why the app
  // is still up to hear it are failure.ts's.
  onFailure(listener: (message: string) => void): void;
  // The log. Writes are fire and forget: main stamps the time, and a write that fails costs that line.
  writeLog(draft: LogDraft): void;
  readLog(): Promise<LogRead>;
  onLogAppended(listener: (entry: LogEntry) => void): void;
  // The Claude screen's session, one per project page and named by its slot. chat-sessions.ts holds
  // what main does with each. A prompt is the content of one user message: text and pasted images.
  chatSend(slot: number, content: ChatContent): void;
  chatInterrupt(slot: number): void;
  // A task in the strip, by its task id; backgrounding takes the tool call that started one, or none
  // for every foreground task, and says whether one matched.
  chatStopTask(slot: number, taskId: string): Promise<void>;
  chatBackgroundTasks(slot: number, toolUseId?: string): Promise<boolean>;
  // The answer to an ask, by the id it arrived with.
  chatAnswer(slot: number, id: string, result: PermissionResult): void;
  chatConfigure(slot: number, change: ChatPreferences): Promise<void>;
  // What the status line shows; null before the session has started.
  chatMeasure(slot: number): Promise<ChatMeasure | null>;
  // What a screen opening the page catches up on: the conversation it would resume, the questions
  // waiting, and the model and mode chosen.
  chatRead(slot: number): Promise<ChatState>;
  chatReset(slot: number): void;
  // The slash commands the session runs; asking starts the session if it is not running.
  chatCommands(slot: number): Promise<CommandRow[]>;
  // The project's files, for the list @ opens in the box.
  chatFiles(slot: number): Promise<string[]>;
  // The models the session offers, for /model; asking starts it the same way.
  chatModels(slot: number): Promise<ModelInfo[]>;
  // The prompts sent in the project's other recent conversations, one list per conversation, newest
  // conversation first; the page's own is left to the screen, which holds it.
  chatHistory(slot: number): Promise<string[][]>;
  // The project's earlier conversations for /resume, and picking one of them.
  chatSessions(slot: number): Promise<ChatSessions>;
  chatResume(slot: number, sessionId: string): void;
  // /branch: the page carries on in a copy of its conversation, titled `title` when one is given.
  // False when there is no conversation yet to copy.
  chatBranch(slot: number, title: string): Promise<boolean>;
  // /rename: the refusal, or null once the conversation is renamed.
  chatRename(slot: number, title: string): Promise<string | null>;
  // The prompts /rewind lists, and putting the code, the conversation or both back to before one;
  // null for a page with no project.
  chatPrompts(slot: number): Promise<RewindPoint[]>;
  chatRewind(slot: number, point: RewindPoint, choice: RewindChoice): Promise<RewindFilesResult | null>;
  // A PDF the conversation names, read by main for the viewer, or why it was not.
  readPdf(slot: number, file: string): Promise<PdfRead>;
  // Escape pressed while the PDF viewer has the keyboard, which only main hears (app-window.ts).
  onViewerDismiss(listener: () => void): void;
  onChat(listener: (slot: number, event: ChatEvent) => void): void;
};

export type ChatContent = (
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageType; data: string } }
)[];

declare global {
  // The one `interface` in src/, and it has to be: this adds a property to a Window that already
  // exists, which is declaration merging — the exact thing the rule turns off everywhere else.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    dashboard: DashboardBridge;
  }
}
