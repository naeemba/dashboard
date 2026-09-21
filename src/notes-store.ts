import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_DIRECTORY, replaceFile } from './board-store';
import { dashboardFolder } from './dashboard-folder';

// A page of free text per project, beside the board in the project's own .dashboard folder, so it
// commits or is ignored with everything else the dashboard keeps about a project. Markdown by
// extension only: nothing here parses it, and nothing on screen renders it. The name is what makes
// the file worth opening in an editor or reading on a forge rather than only in this app.
export const NOTES_FILE = 'notes.md';

// Which folder this lands in is not this file's to decide: the manager has a page of notes and no
// project folder to keep it in, and dashboard-folder.ts is where that is answered for every file the
// dashboard keeps about a page.
export function notesPath(projectPath: string): string {
  return join(dashboardFolder(projectPath), BOARD_DIRECTORY, NOTES_FILE);
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
