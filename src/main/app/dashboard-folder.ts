import { homedir } from 'node:os';
import { isManagerPath } from './manager';

// Which folder a page's .dashboard sits in. A project's is the project itself, so everything the
// dashboard keeps about it commits or is ignored with the rest of the repository.
//
// The manager's page carries no folder — an empty path, which is what MANAGER_PROJECT hands out and
// what session.ts already reads as "this page has nothing on disk" — so there is no project to put it
// in. It goes in the home directory instead, which keeps it out of every repository: a page about none
// of them must not be committed to one of them by accident.
//
// Its own module because two stores ask it: notes-store for the manager's notes and board-store for
// its board. Had the branch lived inside either one, the other would have held a copy of it — and a
// manager whose notes and board disagree about where they live, with nothing failing to say so.
//
// Which path is the manager's is isManagerPath's to say, in manager.ts, not this file's.
export function dashboardFolder(projectPath: string): string {
  return isManagerPath(projectPath) ? homedir() : projectPath;
}

