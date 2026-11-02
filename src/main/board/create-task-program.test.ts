import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyBoard, type Board } from '../../shared/board/board';
import { BOARD_FILE_PATH, writeBoard } from './board-store';
import { runCreateTask } from './create-task-program';

// Real git, against a bare repository standing in for the remote: what the program promises is
// about git — the card lands on the default branch there, and the branch it was run from is left
// exactly as it was — so nothing short of git can check it.

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  });
});

function git(directory: string, ...commandArguments: string[]): string {
  return execFileSync('git', commandArguments, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function remote(): string {
  const bare = mkdtempSync(join(tmpdir(), 'create-task-remote-'));
  git(bare, 'init', '--quiet', '--bare', '-b', 'main');
  return bare;
}

// A clone of `bare` standing on a feature branch with a change it has not committed.
function clone(bare: string, withBoard: boolean): string {
  const checkout = mkdtempSync(join(tmpdir(), 'create-task-checkout-'));
  git(checkout, 'clone', '--quiet', bare, '.');
  git(checkout, 'checkout', '--quiet', '-b', 'main');
  if (withBoard) writeBoard(checkout, emptyBoard());
  git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'start');
  if (withBoard) {
    git(checkout, 'add', BOARD_FILE_PATH);
    git(checkout, 'commit', '--quiet', '-m', 'board');
  }
  git(checkout, 'push', '--quiet', 'origin', 'main');
  git(checkout, 'remote', 'set-head', 'origin', 'main');
  git(checkout, 'checkout', '--quiet', '-b', 'feature');
  return checkout;
}

function boardOn(bare: string): Board {
  return JSON.parse(git(bare, 'show', `main:${BOARD_FILE_PATH}`)) as Board;
}

function run(directory: string, ...commandArguments: string[]): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((text) => { out += String(text); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((text) => { err += String(text); return true; });
  const code = runCreateTask(commandArguments, directory);
  vi.restoreAllMocks();
  return { code, out, err };
}

describe('runCreateTask', () => {
  it('files the card with its title, notes and priority on main, and leaves the branch alone', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    const head = git(checkout, 'rev-parse', 'HEAD');

    const result = run(checkout, '--title', 'Fix the thing', '--notes', 'It breaks', '--priority', 'high');

    expect(result).toMatchObject({ code: 0, err: '' });
    expect(result.out).toMatch(/Backlog {2}Fix the thing {2}on main \([0-9a-f]{8}\)/);
    const [card] = boardOn(bare).columns.flatMap((column) => column.cards);
    expect(card).toMatchObject({ title: 'Fix the thing', notes: 'It breaks', priority: 'high' });
    expect(git(bare, 'log', '-1', '--format=%s', 'main')).toBe('board: add "Fix the thing"');
    expect(git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature');
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(checkout, 'status', '--porcelain')).toBe('');
    // The throwaway worktree is gone.
    expect(git(checkout, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('files on the remote --remote names, not origin', () => {
    const bare = remote();
    const checkout = clone(bare, false);
    const second = remote();
    git(checkout, 'remote', 'add', 'gitlab', second);
    git(checkout, 'checkout', '--quiet', 'main');
    writeBoard(checkout, emptyBoard());
    git(checkout, 'add', BOARD_FILE_PATH);
    git(checkout, 'commit', '--quiet', '-m', 'board');
    git(checkout, 'push', '--quiet', 'gitlab', 'main');
    git(checkout, 'fetch', '--quiet', 'gitlab');
    git(checkout, 'checkout', '--quiet', 'feature');

    expect(run(checkout, '--title', 'On GitLab', '--remote', 'gitlab').code).toBe(0);

    expect(boardOn(second).columns.flatMap((column) => column.cards).map((card) => card.title)).toEqual(['On GitLab']);
    expect(() => git(bare, 'show', `main:${BOARD_FILE_PATH}`)).toThrow();
  });

  it('refuses, naming --seed, when the default branch has no board', () => {
    const bare = remote();
    const checkout = clone(bare, false);
    const before = git(bare, 'rev-parse', 'main');

    const result = run(checkout, '--title', 'x');

    expect(result.code).toBe(1);
    expect(result.err).toBe(
      "create-task: origin/main has no .dashboard/board.json. Re-run with --seed to create it there, from this worktree's copy if it has one. Check first that it was not lost in a merge.\n",
    );
    expect(git(bare, 'rev-parse', 'main')).toBe(before);
  });

  it('creates the board with --seed from the local copy', () => {
    const bare = remote();
    const checkout = clone(bare, false);
    const local = emptyBoard();
    local.columns[0].name = 'Ideas';
    writeBoard(checkout, local);

    expect(run(checkout, '--title', 'Seeded', '--seed').code).toBe(0);

    expect(boardOn(bare).columns.map((column) => column.name)).toContain('Ideas');
    // Left as it was: the seed is read, not moved.
    expect(readFileSync(join(checkout, BOARD_FILE_PATH), 'utf8')).toContain('Ideas');
  });
});

it('names a remote it cannot find a default branch on', () => {
  const checkout = clone(remote(), true);
  expect(run(checkout, '--title', 'x', '--remote', 'nope')).toEqual({
    code: 1, out: '', err: 'create-task: cannot work out which branch on nope is the main one\n',
  });
});
