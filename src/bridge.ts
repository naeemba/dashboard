import type { Project } from './projects';
import type { Board } from './board';
import type { BoardRead } from './board-store';
import type { Session } from './session';
import type { Settings } from './settings';
import type { WorktreeEntry } from './worktree-store';

// What the board hands main when a card is moved into Ship. The slot is the project's page, which is
// what says which five panes are candidates for the agent.
export type ShipRequest = { projectPath: string; cardId: string; title: string; slot: number };
export type ShipResult = { ok: true; entry: WorktreeEntry } | { ok: false; message: string };

export type DashboardBridge = {
  platform: string;
  getRecentProjects(): Promise<Project[]>;
  openProject(projectPath: string | null): Promise<{ index: number; project: Project; replaced: boolean } | null>;
  // Chrome stopped putting a path on File, so only the preload can say where a dropped file lives.
  getPathForFile(file: File): string;
  openExternal(url: string): void;
  // The banner a ringing pane raises. An OS notification belongs to main, the way openExternal does:
  // main is the side macOS knows the app by. The pane's id travels with it so a click on the banner
  // can be answered with the pane it was raised for.
  notify(title: string, body: string, paneId: string): void;
  // A click on that banner, coming back with the id it was raised for.
  onNotificationClick(listener: (paneId: string) => void): void;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string, exitCode: number) => void): void;
  getSession(): Promise<Session>;
  saveSession(session: Session): void;
  readBoard(projectPath: string): Promise<BoardRead>;
  writeBoard(projectPath: string, board: Board): Promise<void>;
  // The settings, and the shell that was resolved from them. One call, because the renderer needs
  // both before it builds a pane and they are decided together.
  getSettings(): Promise<{ settings: Settings; shellCommand: string }>;
  // Answers with the shell main resolved from the new settings, which is the one a dropped path is
  // quoted for.
  saveSettings(settings: Settings): Promise<string>;
  // Moving a card into Ship: the worktree, the branch, the pane and the agent. Answers with the
  // record it wrote, or with the message saying which step refused and why.
  shipCard(request: ShipRequest): Promise<ShipResult>;
  // Every worktree the app has made, with the dead ones already dropped.
  listWorktrees(): Promise<WorktreeEntry[]>;
  // Which of the current worktrees have uncommitted changes, decided by the same predicate
  // worktree:remove asks. Separate from listWorktrees so a `git status` per worktree never rides
  // along behind board-view.ts's call to that on every board open. A worktree git cannot read comes
  // back unreadable rather than clean.
  dirtyWorktrees(): Promise<{ dirty: string[]; unreadable: string[] }>;
  // Removing a worktree. A dirty one comes back refused, with the files listed, so the dialog can ask
  // a second time naming them rather than deciding on its own what "dirty enough" means.
  removeWorktree(worktreePath: string, force: boolean): Promise<{ ok: boolean; message: string; dirty: string[] }>;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
