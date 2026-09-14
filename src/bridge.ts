import type { Project } from './projects';
import type { Board } from './board';
import type { BoardRead } from './board-store';
import type { Session } from './session';
import type { Settings } from './settings';
import type { TaskResult } from './tasks';
import type { WorktreeEntry } from './worktree-store';

// What the board hands main when a card is moved into Ship. The slot is the project's page, which is
// what says which five panes are candidates for the agent.
export type ShipRequest = { projectPath: string; cardId: string; title: string; slot: number };
export type ShipResult = { ok: true; entry: WorktreeEntry } | { ok: false; message: string };

// Everything in flight, and the folder each pane's shell was started in, keyed by terminal id. The
// folders ride along with the records because the status bar's question is the two of them together:
// is the pane I am in one of these checkouts. Only main knows where a pane is, so one message carries
// both; which moments send one is setWorktrees' in main.ts to say.
export type WorktreeList = { entries: WorktreeEntry[]; paneDirectories: Record<string, string> };

export type DashboardBridge = {
  platform: string;
  getRecentProjects(): Promise<Project[]>;
  openProject(projectPath: string | null): Promise<{ index: number; project: Project; replaced: boolean } | null>;
  // Closing a project: its five shells and its editor are killed and its slot is given up. The page is
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
  openScrollback(slot: number, index: number, text: string): Promise<{ ok: boolean; message: string }>;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string, exitCode: number) => void): void;
  getSession(): Promise<Session>;
  saveSession(session: Session): void;
  readBoard(projectPath: string): Promise<BoardRead>;
  writeBoard(projectPath: string, board: Board): Promise<void>;
  // The project whose board.json has become something the app did not write — the `board` command
  // moving a card, or a hand edit. Main watches the file; this is how a board on screen finds out,
  // so a card an agent moves shows up without leaving the board and coming back.
  onBoardChange(listener: (projectPath: string) => void): void;
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
  // Removing a worktree. A dirty one comes back refused, with the files listed, so the dialog can ask
  // a second time naming them rather than deciding on its own what "dirty enough" means.
  removeWorktree(worktreePath: string, force: boolean): Promise<{ ok: boolean; message: string; dirty: string[] }>;
  // One command, run in each of these projects at once, each in its own process. Not a pty and not a
  // pane: a command that borrows a shell throws away whatever was in it.
  runTask(command: string, projectPaths: string[]): void;
  // Stop whatever is still going. Every project that was stopped is named back through onTaskUpdate.
  cancelTasks(): void;
  // One per project, twice: when it starts and when it finishes. Per project rather than one answer at
  // the end, because a row still saying `running` beside four that have answered is the point of the
  // screen.
  onTaskUpdate(listener: (result: TaskResult) => void): void;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
