import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyBoard, type Board } from '../../shared/board/board';
import { runBoardCommand } from './board-cli';
import { BOARD_FOLDER_PATH, openBoard, peekBoard, writeBoard } from './board-store';
import { syncBoard, type BoardEdit } from './board-sync-git';
import { boardOn, git, remote, useGitTestEnvironment } from './create-task-git-fixture';
import { temporaryFolder } from '../testing/temporary-folder';

// Real git, against a bare repository in a temporary folder standing in for origin: what the sync
// promises is about git — what lands on origin's main, what the checkout is left at, and that a
// worktree's branch carries nothing — so nothing short of git can check it. No test reaches any other
// remote.

useGitTestEnvironment();

function command(...words: string[]): BoardEdit {
  return (board) => {
    const result = runBoardCommand(board, words, () => 'added');
    if (!result.ok) throw new Error(result.message);
    return result.board ?? board;
  };
}

// The column each card is in, by id.
function columns(board: Board | null): Record<string, string> {
  return Object.fromEntries((board?.columns ?? []).flatMap((column) => column.cards.map((card) => [card.id, column.name])));
}

function seeded(): Board {
  let board = emptyBoard();
  for (const id of ['a', 'b']) {
    const added = runBoardCommand(board, ['add', `card ${id}`, '--column', 'Todo'], () => id);
    if (!added.ok || added.board === null) throw new Error('seed failed');
    board = added.board;
  }
  return board;
}

// origin with a board of two cards in Todo on main, and a clone of it standing on main.
function project(): { bare: string; checkout: string } {
  const bare = remote();
  const checkout = cloneOf(bare, false);
  writeBoard(checkout, seeded());
  writeFileSync(join(checkout, 'code.txt'), 'one\n');
  git(checkout, 'add', '-A');
  git(checkout, 'commit', '--quiet', '-m', 'start');
  git(checkout, 'push', '--quiet', 'origin', 'HEAD:main');
  git(checkout, 'remote', 'set-head', 'origin', 'main');
  return { bare, checkout };
}

function cloneOf(bare: string, onMain = true): string {
  const checkout = temporaryFolder('board-sync-checkout-');
  git(checkout, 'clone', '--quiet', bare, '.');
  if (onMain) git(checkout, 'remote', 'set-head', 'origin', 'main');
  else git(checkout, 'checkout', '--quiet', '-b', 'main');
  return checkout;
}

// Another writer: a clone that makes the edit and pushes it to main.
function pushFromElsewhere(bare: string, edit: BoardEdit): void {
  const other = cloneOf(bare);
  writeBoard(other, edit(peekBoard(other) ?? emptyBoard()));
  git(other, 'add', '-A');
  git(other, 'commit', '--quiet', '-m', 'elsewhere');
  git(other, 'push', '--quiet', 'origin', 'HEAD:main');
}

function clean(checkout: string): boolean {
  return git(checkout, 'status', '--porcelain') === '';
}

describe('syncBoard', { timeout: 60_000 }, () => {
  it('commits the edit to origin and leaves the checkout on it, clean', async () => {
    const { bare, checkout } = project();
    const outcome = await syncBoard(checkout, command('move', 'a', 'Doing'));
    expect(outcome).toMatchObject({ synced: true, checkout: 'current' });
    expect(columns(boardOn(bare))).toEqual({ a: 'Doing', b: 'Todo' });
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(git(bare, 'rev-parse', 'main'));
    expect(clean(checkout)).toBe(true);
    expect(git(bare, 'log', '-1', '--format=%s', 'main')).toBe('board: "card a" Todo → Doing');
  });

  // The kamandsystem loss: a checkout many commits behind, a `board move` there, and every card the
  // stale copy held written back over origin's.
  it('puts only the edit onto origin from a checkout that is behind, and brings the checkout up', async () => {
    const { bare, checkout } = project();
    pushFromElsewhere(bare, command('move', 'b', 'Done'));
    pushFromElsewhere(bare, command('set', 'b', '--pull-request', '19'));
    const outcome = await syncBoard(checkout, command('move', 'a', 'Doing'));
    expect(outcome).toMatchObject({ synced: true, checkout: 'current' });
    expect(columns(boardOn(bare))).toEqual({ a: 'Doing', b: 'Done' });
    expect(boardOn(bare)?.columns.flatMap((column) => column.cards).find((card) => card.id === 'b')?.pullRequest).toBe(19);
    expect(columns(peekBoard(checkout))).toEqual({ a: 'Doing', b: 'Done' });
    expect(clean(checkout)).toBe(true);
  });

  it('publishes what the app wrote to the checkout and catches it up with origin', async () => {
    const { bare, checkout } = project();
    pushFromElsewhere(bare, command('move', 'b', 'Done'));
    writeBoard(checkout, command('comment', 'a', 'written on the screen')(peekBoard(checkout)!));
    await syncBoard(checkout);
    const card = boardOn(bare)?.columns.flatMap((column) => column.cards).find((entry) => entry.id === 'a');
    expect(card?.comments?.map((comment) => comment.body)).toEqual(['written on the screen']);
    expect(columns(peekBoard(checkout))).toEqual({ a: 'Todo', b: 'Done' });
    expect(clean(checkout)).toBe(true);
    // A second sync has nothing new to say: the comment is not added twice.
    const commits = git(bare, 'rev-list', '--count', 'main');
    await syncBoard(checkout);
    expect(git(bare, 'rev-list', '--count', 'main')).toBe(commits);
  });

  it('writes main from a worktree and leaves the worktree and its branch alone', async () => {
    const { bare, checkout } = project();
    const worktree = join(temporaryFolder('board-sync-worktrees-'), 'card');
    git(checkout, 'worktree', 'add', '--quiet', '-b', 'feature', worktree);
    const branchTip = git(worktree, 'rev-parse', 'HEAD');
    const outcome = await syncBoard(worktree, command('move', 'a', 'Review'));
    expect(outcome).toMatchObject({ synced: true, checkout: 'elsewhere' });
    expect(columns(boardOn(bare))).toEqual({ a: 'Review', b: 'Todo' });
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(branchTip);
    expect(clean(worktree)).toBe(true);
    expect(columns(peekBoard(worktree))).toEqual({ a: 'Todo', b: 'Todo' });
    // The project's checkout, which is what the app shows, is brought up to it.
    expect(columns(peekBoard(checkout))).toEqual({ a: 'Review', b: 'Todo' });
    expect(clean(checkout)).toBe(true);
  });

  it('fetches and tries again when someone pushed between the fetch and the push', async () => {
    const { bare, checkout } = project();
    let tries = 0;
    const outcome = await syncBoard(checkout, (board) => {
      tries += 1;
      if (tries === 1) pushFromElsewhere(bare, command('move', 'b', 'Done'));
      return command('move', 'a', 'Doing')(board);
    });
    expect(outcome).toMatchObject({ synced: true });
    expect(tries).toBe(2);
    expect(columns(boardOn(bare))).toEqual({ a: 'Doing', b: 'Done' });
  });

  it('leaves a checkout with work outside .dashboard where it is, and still writes origin', async () => {
    const { bare, checkout } = project();
    pushFromElsewhere(bare, command('move', 'b', 'Done'));
    writeFileSync(join(checkout, 'code.txt'), 'two\n');
    const head = git(checkout, 'rev-parse', 'HEAD');
    const outcome = await syncBoard(checkout, command('move', 'a', 'Doing'));
    expect(outcome).toMatchObject({ synced: true, checkout: 'stale' });
    expect(columns(boardOn(bare))).toEqual({ a: 'Doing', b: 'Done' });
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(head);
  });

  // A card whose file does not parse is missing from the checkout's board, and publishing that board
  // would delete the card on main for everyone.
  it('publishes nothing from a checkout with a board file that does not parse, in place or set aside', async () => {
    const { bare, checkout } = project();
    writeFileSync(join(checkout, BOARD_FOLDER_PATH, 'cards', 'a.json'), '<<<<<<< HEAD\n{');
    const inPlace = await syncBoard(checkout);
    expect(!inPlace.synced && inPlace.warning).toMatch(/do not parse \(\.dashboard\/board\/cards\/a\.json\)/);
    openBoard(checkout);
    const setAside = await syncBoard(checkout);
    expect(!setAside.synced && setAside.warning).toMatch(/do not parse \(\.dashboard\/board\/cards\/a\.json\)/);
    expect(columns(boardOn(bare))).toEqual({ a: 'Todo', b: 'Todo' });
  });

  // git-lfs installs a post-checkout hook that fails where git-lfs is not on PATH.
  it('runs none of the project\'s hooks', async () => {
    const { bare, checkout } = project();
    const hook = join(checkout, '.git', 'hooks', 'post-checkout');
    writeFileSync(hook, '#!/bin/sh\nexit 2\n');
    chmodSync(hook, 0o755);
    expect(await syncBoard(checkout, command('move', 'a', 'Doing'))).toMatchObject({ synced: true });
    expect(columns(boardOn(bare))).toEqual({ a: 'Doing', b: 'Todo' });
  });

  it('writes nothing and warns when origin cannot be reached', async () => {
    const { checkout } = project();
    git(checkout, 'remote', 'set-url', 'origin', join(temporaryFolder('board-sync-gone-'), 'missing.git'));
    const outcome = await syncBoard(checkout, command('move', 'a', 'Doing'));
    expect(outcome.synced).toBe(false);
    expect(!outcome.synced && outcome.warning).toMatch(/^board written here only, not on origin: cannot fetch origin\/main/);
  });

  it('stays quiet about a board git does not track', async () => {
    const checkout = temporaryFolder('board-sync-untracked-');
    git(checkout, 'init', '--quiet', '-b', 'main');
    writeBoard(checkout, seeded());
    expect(await syncBoard(checkout, command('move', 'a', 'Doing'))).toEqual({ synced: false, warning: null });
  });
});
