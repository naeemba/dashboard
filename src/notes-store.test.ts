import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGER_PROJECT } from './manager';
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

  // The manager page carries no folder, and MANAGER_PROJECT is where that empty path comes from.
  // Asked through that constant rather than a bare '' so the two cannot come apart: give the manager
  // a path one day and this test says so, instead of the app quietly writing a .dashboard folder into
  // whatever directory it happens to have been launched from.
  it("puts the manager's page, which is about no project, in the home directory", () => {
    expect(notesPath(MANAGER_PROJECT.path)).toBe(join(homedir(), BOARD_DIRECTORY, NOTES_FILE));
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
