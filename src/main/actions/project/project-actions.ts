import { basename } from 'node:path';
import type { OpenProjects, ProjectOpen, Refused } from '../../../shared/app/bridge';
import { isRecord } from '../../../shared/app/is-record';
import { pickedFolder } from '../../app/projects';
import type { Channels } from '../../app/channels';
import { bind, isRefused } from '../action';
import { projectClose, type ProjectClosePorts } from './close';
import { projectFocus, type ProjectFocusPorts } from './focus';
import { projectOpen, type ProjectOpenPorts } from './open';

// Main's wiring for the project actions, and the screen's door to them, out of main.ts, which is over
// its 600-line ceiling. Every decision is in open.ts, close.ts and focus.ts. The command's door is
// project-requests.ts; pane.claim's --project takes `openForClaim`.
export type ProjectActionsMain = ProjectOpenPorts & ProjectClosePorts & ProjectFocusPorts;

export function projectActions(main: ProjectActionsMain) {
  const open = bind(projectOpen, main);
  return {
    open,
    close: bind(projectClose, main),
    focus: bind(projectFocus, main),
    async openForClaim(projectPath: string, name: string): Promise<number | Refused> {
      const opened = await open.call({ projectPath, name, from: 'claim' });
      return isRefused(opened) ? opened : opened.index;
    },
  };
}

export type ProjectActions = ReturnType<typeof projectActions>;

// The picker's open and the close key's close. A null path opens the folder dialog; a path from the
// picker skips it, and is refused unless it is a folder (pickedFolder). A refusal is answered, not
// thrown: a throw reaches the screen behind Electron's "Error invoking remote method" prefix.
export function registerProjectChannels(table: Channels, actions: ProjectActions, main: {
  // The folder dialog on the screen that asked: the folder, null for a cancel, or why there is none.
  chooseFolder(screen: string): Promise<string | null | Refused>;
  openProjects(): OpenProjects;
}): void {
  table.handle('projects:open', async (screen, projectPath: string | null): Promise<ProjectOpen> => {
    const chosen = projectPath ?? await main.chooseFolder(screen);
    if (chosen === null || isRefused(chosen)) return chosen;
    const folder = pickedFolder(chosen);
    if (isRefused(folder)) return folder;
    const opened = await actions.open.call({ projectPath: folder.path, name: basename(folder.path), from: 'picker' });
    return isRefused(opened) ? opened : { index: opened.index, open: main.openProjects() };
  });
  table.handle('projects:close', (_screen, request: unknown) => actions.close.call(isRecord(request) ? request : {}));
}
