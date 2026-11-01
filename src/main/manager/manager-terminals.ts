import path from 'node:path';
import { dashboardFolder } from '../app/dashboard-folder';
import { BOARD_DIRECTORY } from '../board/board-store';
import { isInside } from '../panes/shell-directory';
import { MANAGER_PROJECT, MANAGER_SLOT, isManagerPath } from '../../shared/manager/manager';
import type { Project } from '../../shared/app/bridge';

// The manager's terminals: a main session and worker panes like a project's, working in the folder the
// manager's board and notes already live in, so projects.yaml there is in reach of every one of them.
// The renderer's page keeps the empty path MANAGER_PROJECT gives it; this is main's half, the folder a
// shell or a session is started in.
export const MANAGER_FOLDER = path.join(dashboardFolder(MANAGER_PROJECT.path), BOARD_DIRECTORY);

const MANAGER_TERMINALS: Project = { name: MANAGER_PROJECT.name, path: MANAGER_FOLDER, missing: false };

// The key the session index files a page's conversations under: the manager's page has the empty path,
// and its sessions run in, and are filed under, its folder.
export function sessionsFolder(projectPath: string): string {
  return isManagerPath(projectPath) ? MANAGER_FOLDER : projectPath;
}

// What a slot holds as far as starting a shell or a session goes: an open project, or the manager.
export function projectInSlot(projects: readonly (Project | undefined)[], slot: number): Project | undefined {
  return slot === MANAGER_SLOT ? MANAGER_TERMINALS : projects[slot];
}

// The slot a `session` command was run from: the manager's for its folder or anything under it, and
// otherwise `projectSlot`, the open project the folder is in, or -1. The manager's folder is asked first
// because it is the more specific match: a project open at the home folder holds ~/.dashboard too, and
// asked the other way round the manager's main would claim panes on that project's page. Compared in
// real paths, as projectOfFolder compares a project's.
export function sessionSlot(projectSlot: number, directory: string, realPath: (path: string) => string): number {
  return isInside(realPath(directory), realPath(MANAGER_FOLDER)) ? MANAGER_SLOT : projectSlot;
}
