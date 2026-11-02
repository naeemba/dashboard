import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_DIRECTORY, replaceFile } from '../board/board-store';
import { dashboardFolder } from '../app/dashboard-folder';

// The handwriting page of the same notes, beside notes.md. An SVG by extension and in fact: it draws
// itself in a browser or on a forge. Main keeps it as an opaque string — what is in it is the
// renderer's ink-svg.ts's to make and to read — so nothing here parses it.
export const INK_FILE = 'notes-ink.svg';

// The same folder as notes.md for the same reason: which one a page without a project folder means is
// dashboard-folder.ts's answer, and a second reading of it here would be a second sentence to keep true.
export function inkPath(projectPath: string): string {
  return join(dashboardFolder(projectPath), BOARD_DIRECTORY, INK_FILE);
}

// No file is an empty page, and every other failure is thrown, for the reason readNotes gives: a page
// read as blank on an EIO is a page the next stroke writes over.
export function readInk(projectPath: string): string {
  try {
    return readFileSync(inkPath(projectPath), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return '';
  }
}

// A failed write is reported, never swallowed, for the reason writeNotes gives.
export function writeInk(projectPath: string, text: string): void {
  replaceFile(inkPath(projectPath), text);
}
