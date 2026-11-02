import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addCard, columnNamed, emptyBoard, renameCard, selectionOf, type Board } from '../../shared/board/board';
import { readBoard, writeBoard } from '../board/board-store';
import { runBoardCommand } from '../board/board-cli';
import type { BoardChanges } from '../board/board-changes';
import type { BoardWatchers } from '../board/board-watch';
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
    await table.invoke('couch', 'board:write', [projectPath, emptyBoard(), emptyBoard()]);
    expect(told).toEqual([['couch', 'board:change', projectPath]]);
  });

  it('tells every screen but the writer that a page of notes changed', async () => {
    const { table, told, projectPath } = wired();
    await table.invoke('local', 'notes:write', [projectPath, 'hello']);
    expect(told).toEqual([['local', 'notes:change', projectPath]]);
  });

  // The lost move. The screen read the board, an agent then moved a card with the `board` command, and
  // the screen's next save — a rename, from the board it read before the move — must not put the card
  // back where it was.
  it('keeps a card the board command moved after the screen last read the file', async () => {
    const { table, projectPath } = wired();
    const empty = emptyBoard();
    const todo = columnNamed(empty, 'Todo');
    const withAgent = addCard(empty, { column: todo, card: 0 }, 'agent', 'agent card').board;
    const onScreen = addCard(withAgent, { column: todo, card: 1 }, 'mine', 'my card').board;
    writeBoard(projectPath, onScreen);

    const moved = runBoardCommand(readBoard(projectPath).board, ['move', 'agent', 'Review']);
    if (!moved.ok || moved.board === null) throw new Error('the move was refused');
    writeBoard(projectPath, moved.board);

    const renamed = renameCard(onScreen, selectionOf(onScreen, 'mine')!, 'renamed').board;
    const written = await table.invoke('couch', 'board:write', [projectPath, onScreen, renamed]) as Board;

    const onDisk = readBoard(projectPath).board;
    expect(onDisk.columns[selectionOf(onDisk, 'agent')!.column].name).toBe('Review');
    expect(onDisk.columns[selectionOf(onDisk, 'mine')!.column].cards[0].title).toBe('renamed');
    expect(written).toEqual(onDisk);
  });
});
