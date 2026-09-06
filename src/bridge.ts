import type { Project } from './projects';
import type { Board } from './board';
import type { BoardRead } from './board-store';
import type { Session } from './session';

export type DashboardBridge = {
  platform: string;
  // The shell a pane actually runs, which SHELL_COMMAND can point at another family entirely, so quoting
  // a dropped path has to follow this rather than the platform.
  shellCommand: string;
  getRecentProjects(): Promise<Project[]>;
  openProject(projectPath: string | null): Promise<{ index: number; project: Project; replaced: boolean } | null>;
  // Chrome stopped putting a path on File, so only the preload can say where a dropped file lives.
  getPathForFile(file: File): string;
  openExternal(url: string): void;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string, exitCode: number) => void): void;
  getSession(): Promise<Session>;
  saveSession(session: Session): void;
  readBoard(projectPath: string): Promise<BoardRead>;
  writeBoard(projectPath: string, board: Board): Promise<void>;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
