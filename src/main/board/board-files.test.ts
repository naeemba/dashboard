import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCard, allCards, emptyBoard, moveCardById, type Board } from '../../shared/board/board';
import { BOARD_FILE_PATH, BOARD_FOLDER_PATH, BOARD_PATHSPECS, peekBoard, readBoard, writeBoard } from './board-store';
import { git, useGitTestEnvironment, writeLegacyBoard } from './create-task-git-fixture';

// The board kept one file per card: the move off board.json, and the merges it exists for.

useGitTestEnvironment();

function project(): string {
  return mkdtempSync(join(tmpdir(), 'board-files-'));
}

function cardsFolder(projectPath: string): string {
  return join(projectPath, BOARD_FOLDER_PATH, 'cards');
}

function titles(board: Board, column: string): string[] {
  return board.columns.find((candidate) => candidate.name === column)?.cards.map((card) => card.title) ?? [];
}

function withCard(board: Board, column: number, title: string): Board {
  return addCard(board, { column, card: 0 }, randomUUID(), title).board;
}

function columnIndex(board: Board, name: string): number {
  return board.columns.findIndex((column) => column.name === name);
}

function cardId(board: Board, title: string): string {
  const card = allCards(board).find((candidate) => candidate.title === title);
  if (!card) throw new Error(`no card ${title}`);
  return card.id;
}

// A small board with cards in two columns, the starting point of every merge below.
function startingBoard(): Board {
  let board = emptyBoard();
  for (const title of ['one', 'two', 'three']) board = withCard(board, columnIndex(board, 'Todo'), title);
  for (const title of ['four', 'five']) board = withCard(board, columnIndex(board, 'Doing'), title);
  return board;
}

describe('the move off board.json', () => {
  // This repository's own board, whichever way it is kept today, written out as the board.json every
  // project the app has opened still holds: about a hundred and seventy cards, with comments,
  // subtasks, pull requests and hand-written fields.
  it('moves this repository\'s real board into the folder with no card, field or place lost', () => {
    const real = peekBoard(process.cwd());
    if (real === null) throw new Error('this repository has no board to test the move with');
    const path = project();
    writeLegacyBoard(path, real);
    const before = readBoard(path).board;

    writeBoard(path, before);

    expect(existsSync(join(path, BOARD_FILE_PATH))).toBe(false);
    expect(readdirSync(cardsFolder(path))).toHaveLength(allCards(before).length);
    expect(readBoard(path).board).toEqual(before);
    expect(allCards(before).length).toBeGreaterThan(100);
  });

  it('reads a board.json nothing has written since, and leaves it where it is', () => {
    const path = project();
    writeLegacyBoard(path, startingBoard());
    const text = readFileSync(join(path, BOARD_FILE_PATH), 'utf8');

    expect(titles(readBoard(path).board, 'Todo')).toEqual(['one', 'two', 'three']);
    expect(readFileSync(join(path, BOARD_FILE_PATH), 'utf8')).toBe(text);
    expect(existsSync(join(path, BOARD_FOLDER_PATH))).toBe(false);
  });

  // A write that stopped after the cards and before the old file went, or a branch still editing
  // board.json merged into one that has moved on.
  it('keeps a card only board.json has when both are there, and the folder\'s copy of the rest', () => {
    const path = project();
    const board = startingBoard();
    const moved = moveCardById(board, cardId(board, 'one'), columnIndex(board, 'Done'));
    if (!moved) throw new Error('no move');
    writeBoard(path, moved);
    writeLegacyBoard(path, withCard(board, columnIndex(board, 'Backlog'), 'only in the old file'));

    const read = readBoard(path).board;

    expect(titles(read, 'Backlog')).toEqual(['only in the old file']);
    expect(titles(read, 'Done')).toEqual(['one']);
    expect(titles(read, 'Todo')).toEqual(['two', 'three']);
  });
});

describe('the folder', () => {
  it('rewrites only the file of the card that moved', () => {
    const path = project();
    const board = startingBoard();
    writeBoard(path, board);
    const files = Object.fromEntries(readdirSync(cardsFolder(path)).map((name) => [name, readFileSync(join(cardsFolder(path), name), 'utf8')]));
    const moved = moveCardById(board, cardId(board, 'one'), columnIndex(board, 'Doing'));
    if (!moved) throw new Error('no move');

    writeBoard(path, moved);

    const changed = readdirSync(cardsFolder(path)).filter((name) => readFileSync(join(cardsFolder(path), name), 'utf8') !== files[name]);
    expect(changed).toEqual([`${cardId(board, 'one')}.json`]);
    expect(titles(readBoard(path).board, 'Doing')).toEqual(['four', 'five', 'one']);
  });

  it('keeps an empty column and the order of the columns', () => {
    const path = project();
    const board = startingBoard();
    board.columns.reverse();
    writeBoard(path, board);
    expect(readBoard(path).board.columns.map((column) => column.name)).toEqual(board.columns.map((column) => column.name));
  });

  it('removes the file of a deleted card', () => {
    const path = project();
    const board = startingBoard();
    writeBoard(path, board);
    const gone = cardId(board, 'two');
    writeBoard(path, { columns: board.columns.map((column) => ({ ...column, cards: column.cards.filter((card) => card.id !== gone) })) });
    expect(readdirSync(cardsFolder(path))).not.toContain(`${gone}.json`);
  });

  // Copying a card's file is the obvious way to make a similar card by hand, and the id comes with it.
  it('names a card file by an id that cannot leave the folder', () => {
    const path = project();
    writeBoard(path, { columns: [{ name: 'Todo', cards: [{ ...startingBoard().columns[1].cards[0], id: '../../escape' }] }] });
    expect(readdirSync(cardsFolder(path))).toEqual(['..%2F..%2Fescape.json']);
    expect(allCards(readBoard(path).board).map((card) => card.id)).toEqual(['../../escape']);
  });

  it('sets a card file that does not parse aside on a read, and leaves it alone on a look', () => {
    const path = project();
    writeBoard(path, startingBoard());
    writeFileSync(join(cardsFolder(path), 'broken.json'), '{');

    expect(allCards(peekBoard(path) ?? emptyBoard())).toHaveLength(5);
    expect(existsSync(join(cardsFolder(path), 'broken.json'))).toBe(true);

    const read = readBoard(path);
    expect(read.brokenFile).toBe(join(cardsFolder(path), 'broken.json.broken'));
    expect(allCards(read.board)).toHaveLength(5);
  });

  it('puts a hand-written card that names no column in Backlog', () => {
    const path = project();
    writeBoard(path, startingBoard());
    writeFileSync(join(cardsFolder(path), 'by-hand.json'), '{ "title": "by hand" }');
    const read = readBoard(path).board;
    expect(titles(read, 'Backlog')).toEqual(['by hand']);
    expect(cardId(read, 'by hand')).toBe('by-hand');
  });
});

// The reason for the folder: two branches each working their own card, merged, with nobody asked
// to settle a conflict. Real git, real merges.
describe('merging two branches', { timeout: 60_000 }, () => {
  function repository(board: Board): string {
    const path = project();
    git(path, 'init', '--quiet', '-b', 'main');
    mkdirSync(join(path, '.dashboard'), { recursive: true });
    writeBoard(path, board);
    git(path, 'add', '-A', '--', ...BOARD_PATHSPECS);
    git(path, 'commit', '--quiet', '-m', 'board');
    return path;
  }

  function onBranch(path: string, branch: string, edit: (board: Board) => Board): void {
    git(path, 'checkout', '--quiet', '-b', branch, 'main');
    writeBoard(path, edit(readBoard(path).board));
    git(path, 'add', '-A', '--', ...BOARD_PATHSPECS);
    git(path, 'commit', '--quiet', '-m', branch);
  }

  function mergeBoth(path: string): Board {
    git(path, 'checkout', '--quiet', 'main');
    git(path, 'merge', '--quiet', '--no-edit', 'first');
    git(path, 'merge', '--quiet', '--no-edit', 'second');
    return readBoard(path).board;
  }

  function moved(board: Board, title: string, column: string): Board {
    const next = moveCardById(board, cardId(board, title), columnIndex(board, column));
    if (!next) throw new Error('no move');
    return next;
  }

  it('merges two branches that each added a card to the same column', () => {
    const path = repository(startingBoard());
    onBranch(path, 'first', (board) => withCard(board, columnIndex(board, 'Todo'), 'added on first'));
    onBranch(path, 'second', (board) => withCard(board, columnIndex(board, 'Todo'), 'added on second'));

    const merged = mergeBoth(path);

    expect(titles(merged, 'Todo')).toEqual(expect.arrayContaining(['one', 'two', 'three', 'added on first', 'added on second']));
    expect(titles(merged, 'Todo')).toHaveLength(5);
  });

  it('merges two branches that each moved a different card, out of one column and into another', () => {
    const path = repository(startingBoard());
    onBranch(path, 'first', (board) => moved(board, 'one', 'Review'));
    onBranch(path, 'second', (board) => moved(board, 'three', 'Done'));

    const merged = mergeBoth(path);

    expect(titles(merged, 'Todo')).toEqual(['two']);
    expect(titles(merged, 'Review')).toEqual(['one']);
    expect(titles(merged, 'Done')).toEqual(['three']);
    expect(titles(merged, 'Doing')).toEqual(['four', 'five']);
  });

  // The first write of a board still kept in board.json happens on one branch; the other branch is
  // cut from after it, which is how the move reaches every branch once main has it.
  it('merges a branch that moved the board into its folder with a card added on main meanwhile', () => {
    const path = project();
    git(path, 'init', '--quiet', '-b', 'main');
    writeLegacyBoard(path, startingBoard());
    git(path, 'add', '-A', '--', ...BOARD_PATHSPECS);
    git(path, 'commit', '--quiet', '-m', 'board.json');
    onBranch(path, 'first', (board) => moved(board, 'one', 'Doing'));

    expect(git(path, 'show', '--name-status', '--format=', 'first')).toContain(`D\t${BOARD_FILE_PATH}`);
    git(path, 'checkout', '--quiet', 'main');
    git(path, 'merge', '--quiet', '--no-edit', 'first');
    onBranch(path, 'second', (board) => withCard(board, columnIndex(board, 'Todo'), 'after the move'));
    git(path, 'checkout', '--quiet', 'main');
    git(path, 'merge', '--quiet', '--no-edit', 'second');

    const merged = readBoard(path).board;
    expect(titles(merged, 'Doing')).toEqual(['four', 'five', 'one']);
    expect(titles(merged, 'Todo')).toEqual(['two', 'three', 'after the move']);
  });
});
