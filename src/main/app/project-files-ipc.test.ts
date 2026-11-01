import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBoard } from './board';
import type { BoardChanges } from './board-changes';
import type { BoardWatchers } from './board-watch';
import { channels } from './channels';
import { registerProjectFiles } from './project-files-ipc';

const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })); });

function wired() {
  const projectPath = mkdtempSync(path.join(tmpdir(), 'project-files-'));
  directories.push(projectPath);
  const table = channels();
  const told: string[][] = [];
  const boards = { watch: () => undefined, wrote: () => undefined } as unknown as BoardWatchers;
  const changes = { seen: () => undefined, wrote: (_path: string, _board: unknown, write: () => void) => write() } as unknown as BoardChanges;
  registerProjectFiles(table, boards, changes, (screen, channel, changed) => told.push([screen, channel, changed]));
  return { table, told, projectPath };
}

describe('registerProjectFiles', () => {
  // To the watcher a write through the app is the app's own, so without this a board left open on
  // one screen never sees what was moved on the other, and its next save puts it back.
  it('tells every screen but the writer that a board changed', async () => {
    const { table, told, projectPath } = wired();
    await table.invoke('couch', 'board:write', [projectPath, emptyBoard()]);
    expect(told).toEqual([['couch', 'board:change', projectPath]]);
  });

  it('tells every screen but the writer that a page of notes changed', async () => {
    const { table, told, projectPath } = wired();
    await table.invoke('local', 'notes:write', [projectPath, 'hello']);
    expect(told).toEqual([['local', 'notes:change', projectPath]]);
  });
});
