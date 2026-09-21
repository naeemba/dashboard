import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BOARD_DIRECTORY, replaceFile } from './board-store';

// A page of free text per project, beside the board in the project's own .dashboard folder, so it
// commits or is ignored with everything else the dashboard keeps about a project. Markdown by
// extension only: nothing here parses it, and nothing on screen renders it. The name is what makes
// the file worth opening in an editor or reading on a forge rather than only in this app.
export const NOTES_FILE = 'notes.md';

// The manager has a page of notes too, and it is the one page that is about no project. Its page
// carries no folder — an empty path, which is what MANAGER_PROJECT hands out and what session.ts
// already reads as "this page has nowhere on disk" — so there is no project .dashboard to put it in.
// It goes in one in the home directory instead, which keeps it out of every repository: a page about
// none of them must not be committed to one of them by accident.
//
// The empty path is the whole of how this is spelled, here and nowhere else. The renderer hands over
// the manager page's own project path rather than an empty string of its own, so there is one fact to
// keep in step instead of two literals that agree until somebody changes one.
function notesFolder(projectPath: string): string {
  return projectPath === '' ? homedir() : projectPath;
}

export function notesPath(projectPath: string): string {
  return join(notesFolder(projectPath), BOARD_DIRECTORY, NOTES_FILE);
}

// A project that has never had notes has no file, which is not a failure — it is an empty page, and
// the first thing you type is what decides whether a file exists.
//
// Every other reason a read can fail is one. Swallow an EMFILE or an EIO here and the box goes blank,
// the placeholder says this project has never had notes, and the next character you type is written
// whole over three months of them. The caller keeps what it was showing instead.
export function readNotes(projectPath: string): string {
  try {
    return readFileSync(notesPath(projectPath), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return '';
  }
}

// Unlike reading, a failed write is reported: the screen would otherwise show a page of notes that is
// not on disk, and the next launch would open blank with nothing having said why.
export function writeNotes(projectPath: string, text: string): void {
  replaceFile(notesPath(projectPath), text);
}
