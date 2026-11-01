import type { OpenProjects, Project } from '../../shared/app/bridge';
import type { Channels } from '../app/channels';
import { terminalId } from '../../shared/panes/terminals';

// The new-pane and close-pane channels. Main-process wiring only, out of main.ts at its 600-line
// ceiling; main hands over the worker lifecycle it holds.
export function registerWorkerChannels(table: Channels, main: {
  project(slot: number): Project | undefined;
  openPanes(slot: number): number[];
  openWorker(slot: number): number;
  closeWorker(id: string): void;
  openProjects(): OpenProjects;
}): void {
  // The key and the button above the worker list. A project with no folder has no panes to add to.
  table.handle('pane:add', (_screen, slot: number) => {
    const project = main.project(slot);
    if (project === undefined || project.missing) return null;
    return { index: main.openWorker(slot), open: main.openProjects() };
  });
  // The close key and a worker's close button. Only a worker that is open: main is the Claude screen and
  // the editor is not in the list.
  table.handle('pane:close', (_screen, slot: number, index: number) => {
    if (main.openPanes(slot).includes(index)) main.closeWorker(terminalId(slot, index));
  });
}
