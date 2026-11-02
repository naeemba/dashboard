import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { emptyBoard } from '../../shared/board/board';
import { BOARD_FILE_PATH, writeBoard } from './board-store';

// Real git for the create-task tests, against a bare repository standing in for the remote. Not a
// .test.ts, so vitest runs it only through the files that import it.

const testEnvironment = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  // The machine's own git config shut out, as in git.test.ts: a global gpgsign or hooksPath would
  // make this fail on one laptop with nothing about the code changed. The program inherits it.
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

// Called at the top of a test file: the environment above for every test in it, then put back.
export function useGitTestEnvironment(): void {
  const savedEnvironment = Object.fromEntries(Object.keys(testEnvironment).map((name) => [name, process.env[name]]));
  beforeAll(() => {
    Object.assign(process.env, testEnvironment);
  });
  afterAll(() => {
    for (const [name, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

export function git(directory: string, ...commandArguments: string[]): string {
  return execFileSync('git', commandArguments, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function remote(): string {
  const bare = mkdtempSync(join(tmpdir(), 'create-task-remote-'));
  git(bare, 'init', '--quiet', '--bare', '-b', 'main');
  return bare;
}

// A clone of `bare` standing on a feature branch with a change it has not committed.
export function clone(bare: string, withBoard: boolean): string {
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
