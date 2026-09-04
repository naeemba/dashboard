import type { Project } from './projects';

export type DashboardBridge = {
  platform: string;
  getProjects(): Promise<Project[]>;
  pickProject(): Promise<{ index: number; project: Project; replaced: boolean } | null>;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string, exitCode: number) => void): void;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
