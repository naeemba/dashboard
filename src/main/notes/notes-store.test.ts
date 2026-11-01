import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY } from './board-store';
import { NOTES_FILE, notesPath, readNotes, writeNotes } from './notes-store';

function project(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-notes-'));
}

describe('the notes file', () => {
  it('is an empty page on a project that has never had one', () => {
    expect(readNotes(project())).toBe('');
  });

  it('reads back what was written, including the blank page you emptied it to', () => {
    const projectPath = project();
    writeNotes(projectPath, 'buy milk\n');
    expect(readNotes(projectPath)).toBe('buy milk\n');
    writeNotes(projectPath, '');
    expect(readNotes(projectPath)).toBe('');
  });

  // Which folder is dashboard-folder.ts's answer and is tested there. This asks only that notesPath
  // goes through it, so a page with no project folder still gets a notes.md rather than one written
  // beside whatever directory the app was launched from.
  it('follows dashboardFolder for a page with no project folder behind it', () => {
    expect(notesPath('')).toBe(join(homedir(), BOARD_DIRECTORY, NOTES_FILE));
  });

  it('makes .dashboard on the way, so the first thing you type is what creates it', () => {
    const projectPath = project();
    writeNotes(projectPath, 'first');
    expect(readFileSync(notesPath(projectPath), 'utf8')).toBe('first');
  });

  // Anything that is not "no file" is a failure the screen has to hear about. Answer '' here and the
  // box blanks, then saves the blank back over whatever was really on disk.
  it('throws rather than reading an empty page when the name is a folder', () => {
    const projectPath = project();
    mkdirSync(notesPath(projectPath), { recursive: true });
    expect(() => readNotes(projectPath)).toThrow();
  });

  it('leaves the old page whole when the rename cannot land', () => {
    const projectPath = project();
    writeNotes(projectPath, 'the page that was there\n');
    // A folder where the temporary file has to go: the write fails before the rename, so nothing
    // replaces notes.md and what was there is still all of it.
    mkdirSync(`${notesPath(projectPath)}.tmp`, { recursive: true });
    expect(() => writeNotes(projectPath, 'half a p')).toThrow();
    expect(readNotes(projectPath)).toBe('the page that was there\n');
  });
});
