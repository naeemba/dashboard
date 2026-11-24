import { homedir } from 'node:os';
import { join } from 'node:path';
import { isManagerPath } from '../../shared/manager/manager';

// The folder everything the dashboard keeps about a page lives in, so there is one thing to commit or
// to ignore.
export const DASHBOARD_FOLDER_NAME = '.dashboard';

// A path inside a page's .dashboard. A project's sits in the project itself, so everything the
// dashboard keeps about it commits or is ignored with the rest of the repository.
//
// The manager's page carries no folder — an empty path, which is what MANAGER_PROJECT hands out and
// what session.ts already reads as "this page has nothing on disk" — so there is no project to put it
// in. It goes in the home directory instead, which keeps it out of every repository: a page about none
// of them must not be committed to one of them by accident.
//
// Its own module because every store asks it: the board, the notes, the ink, the manager's terminals
// and projects.yaml. Had the branch lived inside any one of them, the others would have held a copy of
// it — and a manager whose notes and board disagree about where they live, with nothing failing to
// say so.
//
// Which path is the manager's is isManagerPath's to say, in manager.ts, not this file's.
export function dashboardPath(projectPath: string, ...parts: string[]): string {
  return join(isManagerPath(projectPath) ? homedir() : projectPath, DASHBOARD_FOLDER_NAME, ...parts);
}
