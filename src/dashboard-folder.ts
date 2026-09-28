import { homedir } from 'node:os';

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
// The empty path is read here and nowhere else. The renderer hands over the manager page's own project
// path rather than an empty string of its own, so there is one fact to keep in step instead of two
// literals that agree until somebody changes one.
export function dashboardFolder(projectPath: string): string {
  return isManagerPath(projectPath) ? homedir() : projectPath;
}

// Whether this path is the manager's page, which has no repository behind it. The board asks it
// because what a board can do there is less than what it can do in a project: nothing to ship a card
// from, and no `board` command that reaches it.
export function isManagerPath(projectPath: string): boolean {
  return projectPath === '';
}
