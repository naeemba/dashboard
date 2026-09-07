import type { Project } from './projects';
import type { Board } from './board';
import type { BoardRead } from './board-store';
import type { Session } from './session';
import type { Settings } from './settings';

export type DashboardBridge = {
  platform: string;
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
  // The settings, and the shell that was resolved from them. One call, because the renderer needs
  // both before it builds a pane and they are decided together.
  getSettings(): Promise<{ settings: Settings; shellCommand: string }>;
  // Answers with the shell main resolved from the new settings, which is the one a dropped path is
  // quoted for.
  saveSettings(settings: Settings): Promise<string>;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
