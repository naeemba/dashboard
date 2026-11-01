import path from 'node:path';
import { dashboardFolder } from '../app/dashboard-folder';
import { BOARD_DIRECTORY } from '../board/board-store';
import { isInside } from '../panes/shell-directory';
import { MANAGER_PROJECT, MANAGER_SLOT } from '../../shared/manager/manager';
import type { Project } from '../../shared/app/bridge';

// The manager's terminals: a main session and worker panes like a project's, working in the folder the
// manager's board and notes already live in, so projects.yaml there is in reach of every one of them.
// The renderer's page keeps the empty path MANAGER_PROJECT gives it; this is main's half, the folder a
// shell or a session is started in.
export const MANAGER_FOLDER = path.join(dashboardFolder(MANAGER_PROJECT.path), BOARD_DIRECTORY);

const MANAGER_TERMINALS: Project = { name: MANAGER_PROJECT.name, path: MANAGER_FOLDER, missing: false };

// What a slot holds as far as starting a shell or a session goes: an open project, or the manager.
export function projectInSlot(projects: readonly (Project | undefined)[], slot: number): Project | undefined {
  return slot === MANAGER_SLOT ? MANAGER_TERMINALS : projects[slot];
}

// The slot a `session` command was run from. `projectSlot` is the open project the folder is in, or
// -1; a folder in none of them is the manager's when it is the manager's folder or under it. Compared in
// real paths, as projectOfFolder compares a project's.
export function sessionSlot(projectSlot: number, directory: string, realPath: (path: string) => string): number {
  if (projectSlot !== -1) return projectSlot;
  return isInside(realPath(directory), realPath(MANAGER_FOLDER)) ? MANAGER_SLOT : -1;
}
