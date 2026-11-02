import { chmodSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY } from '../board/board-store';
import { INK_FILE, inkPath, readInk, writeInk } from './ink-store';

// Skipped on Windows, which has no POSIX file modes: chmod neither locks a folder against writes nor leaves a mode to read back.
const posixOnly = it.skipIf(process.platform === 'win32');

function project(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-ink-'));
}

describe('the ink file', () => {
  it('is an empty page on a project that has never had one', () => {
    expect(readInk(project())).toBe('');
  });

  it('reads back what was written, including the blank page you cleared it to', () => {
    const projectPath = project();
    writeInk(projectPath, '<svg/>\n');
    expect(readInk(projectPath)).toBe('<svg/>\n');
    writeInk(projectPath, '');
    expect(readInk(projectPath)).toBe('');
  });

  it('follows dashboardFolder for a page with no project folder behind it', () => {
    expect(inkPath('')).toBe(join(homedir(), BOARD_DIRECTORY, INK_FILE));
  });

  it('makes .dashboard on the way, so the first stroke is what creates it', () => {
    const projectPath = project();
    writeInk(projectPath, 'first');
    expect(readFileSync(inkPath(projectPath), 'utf8')).toBe('first');
  });

  it('throws rather than reading an empty page when the name is a folder', () => {
    const projectPath = project();
    mkdirSync(inkPath(projectPath), { recursive: true });
    expect(() => readInk(projectPath)).toThrow();
  });

  posixOnly('leaves the old page whole when the new one cannot be written', () => {
    const projectPath = project();
    writeInk(projectPath, 'the page that was there\n');
    // A folder that takes no new file: the temporary file cannot be made, so nothing replaces
    // the ink file and what was there is still all of it.
    const folder = dirname(inkPath(projectPath));
    chmodSync(folder, 0o500);
    try {
      expect(() => writeInk(projectPath, 'half a p')).toThrow();
    } finally {
      chmodSync(folder, 0o700);
    }
    expect(readInk(projectPath)).toBe('the page that was there\n');
  });
});
