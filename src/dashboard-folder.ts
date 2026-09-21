import { homedir } from 'node:os';

// Which folder a page's .dashboard sits in. A project's is the project itself, so everything the
// dashboard keeps about it commits or is ignored with the rest of the repository.
//
// The manager's page carries no folder — an empty path, which is what MANAGER_PROJECT hands out and
// what session.ts already reads as "this page has nothing on disk" — so there is no project to put it
// in. It goes in the home directory instead, which keeps it out of every repository: a page about none
// of them must not be committed to one of them by accident.
//
// Its own module because two stores will ask it and only one asks it today. notes-store calls it now;
// the manager has no board yet, and the card that gives it one is where boardPath joins this rule. Had
// the branch stayed inside notesPath, that card's obvious move would have been to copy the same line
// into board-store — and then a manager whose notes and board disagree about where they live, with
// nothing failing to say so.
//
// The empty path is read here and nowhere else. The renderer hands over the manager page's own project
// path rather than an empty string of its own, so there is one fact to keep in step instead of two
// literals that agree until somebody changes one.
export function dashboardFolder(projectPath: string): string {
  return projectPath === '' ? homedir() : projectPath;
}
