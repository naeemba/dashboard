import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, BOARD_FILE_PATH } from './board-store';
import { git } from './git';
import { blockingChanges } from './ship';

// A real repository rather than a mocked child process: what is pinned here is what git prints and
// what we keep of it, and a mock prints back whatever the test already believes.
//
// The machine's own git config is shut out. Left in, a global gpgsign stops the commit waiting for a
// passphrase and a global hooksPath runs somebody's hook, so the test fails on one person's laptop
// with nothing about the code changed.
function repositoryWithAnEditedBoard(): string {
  const repository = mkdtempSync(join(tmpdir(), 'dashboard-git-'));
  const run = (...args: string[]): void => {
    execFileSync('git', args, {
      cwd: repository,
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    });
  };
  run('init', '-q');
  mkdirSync(join(repository, BOARD_DIRECTORY), { recursive: true });
  const board = join(repository, BOARD_FILE_PATH);
  writeFileSync(board, 'committed\n');
  run('add', '.');
  run('-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'first');
  writeFileSync(board, 'changed since\n');
  return repository;
}

// Built once: neither test writes to it, and the three git processes are the whole cost of this file.
const repository = repositoryWithAnEditedBoard();

describe('git', () => {
  it('keeps the blank column an unstaged change starts with', async () => {
    expect(await git(['status', '--porcelain'], repository)).toBe(` M ${BOARD_FILE_PATH}`);
  });

  // The seam, which is where this went wrong: both halves were tested on their own and both passed,
  // while the string one handed the other was one character short. A ship reading its own board move
  // as somebody's uncommitted work refused every card it was given.
  it('hands blockingChanges a board change it still recognises', async () => {
    expect(blockingChanges(await git(['status', '--porcelain'], repository))).toEqual([]);
  });
});
