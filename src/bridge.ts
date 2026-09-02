import type { Project } from './projects';

export type DashboardBridge = {
  platform: string;
  getProjects(): Promise<Project[]>;
  sendInput(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  restart(id: string): void;
  onData(listener: (id: string, data: string) => void): void;
  onExit(listener: (id: string) => void): void;
};

declare global {
  interface Window {
    dashboard: DashboardBridge;
  }
}
