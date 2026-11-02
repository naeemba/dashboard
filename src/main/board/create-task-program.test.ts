import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyBoard, type Board } from '../../shared/board/board';
import { BOARD_FILE_PATH, writeBoard } from './board-store';
import { runCreateTask } from './create-task-program';

// Real git, against a bare repository standing in for the remote: what the program promises is
// about git — the card lands on the default branch there, and the branch it was run from is left
// exactly as it was — so nothing short of git can check it.

const testEnvironment = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  // The machine's own git config shut out, as in git.test.ts: a global gpgsign or hooksPath would
  // make this fail on one laptop with nothing about the code changed. The program inherits it.
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};
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

function run(directory: string, ...commandArguments: string[]): { code: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((text) => { stdout += String(text); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((text) => { stderr += String(text); return true; });
  const code = runCreateTask(commandArguments, directory);
  vi.restoreAllMocks();
  return { code, stdout, stderr };
}

// A hook on the bare remote that counts the pushes reaching it in `pushes`.
function remoteHook(bare: string, name: string, body: string): void {
  const hook = join(bare, 'hooks', name);
  writeFileSync(hook, `#!/bin/sh\necho >> "$GIT_DIR/pushes"\n${body}\n`);
  chmodSync(hook, 0o755);
}

function pushesTo(bare: string): number {
  try {
    return readFileSync(join(bare, 'pushes'), 'utf8').length;
  } catch {
    return 0;
  }
}

// Another writer that moves main while each of the first `races` pushes is under way, the way a
// second push landing first does: the remote answers "incorrect old value provided" (git 2.51 and
// later) or "is at <sha> but expected <sha>" (older git).
function racingWriter(bare: string, checkout: string, races: number): void {
  const commits: string[] = [];
  git(checkout, 'checkout', '--quiet', 'main');
  for (let race = 0; race < races; race += 1) {
    git(checkout, 'commit', '--quiet', '--allow-empty', '-m', `other writer ${race}`);
    commits.push(git(checkout, 'rev-parse', 'HEAD'));
  }
  git(checkout, 'push', '--quiet', 'origin', 'HEAD:refs/heads/other');
  git(checkout, 'reset', '--quiet', '--hard', 'origin/main');
  git(checkout, 'checkout', '--quiet', 'feature');
  writeFileSync(join(bare, 'racing'), commits.map((commit) => `${commit}\n`).join(''));
  remoteHook(bare, 'update', [
    'next=$(head -n 1 "$GIT_DIR/racing")',
    '[ -z "$next" ] && exit 0',
    'tail -n +2 "$GIT_DIR/racing" > "$GIT_DIR/racing.next" && mv "$GIT_DIR/racing.next" "$GIT_DIR/racing"',
    'git update-ref refs/heads/main "$next"',
  ].join('\n'));
}

describe('runCreateTask', () => {
  it('files the card with its title, notes and priority on main, and leaves the branch alone', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    const head = git(checkout, 'rev-parse', 'HEAD');

    const result = run(checkout, '--title', 'Fix the thing', '--notes', 'It breaks', '--priority', 'high');

    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(result.stdout).toMatch(/Backlog {2}Fix the thing {2}on main \([0-9a-f]{8}\)/);
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
    expect(result.stderr).toBe(
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

  it('names a remote it cannot find a default branch on', () => {
    const checkout = clone(remote(), true);
    expect(run(checkout, '--title', 'x', '--remote', 'nope')).toEqual({
      code: 1, stdout: '', stderr: 'create-task: cannot work out which branch on nope is the main one\n',
    });
  });

  it('refuses, and leaves main alone, when the board there does not parse', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    git(checkout, 'checkout', '--quiet', 'main');
    writeFileSync(join(checkout, BOARD_FILE_PATH), '{');
    git(checkout, 'commit', '--quiet', '-am', 'broken');
    git(checkout, 'push', '--quiet', 'origin', 'main');
    git(checkout, 'checkout', '--quiet', 'feature');
    const before = git(bare, 'rev-parse', 'main');

    expect(run(checkout, '--title', 'x')).toEqual({
      code: 1, stdout: '', stderr: 'create-task: origin/main has a .dashboard/board.json that does not parse; fix it there first\n',
    });
    expect(git(bare, 'rev-parse', 'main')).toBe(before);
  });

  it('pushes nothing on --dry-run', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    const before = git(bare, 'rev-parse', 'main');

    const result = run(checkout, '--title', 'Not yet', '--dry-run');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('(dry run) would add');
    expect(git(bare, 'rev-parse', 'main')).toBe(before);
  });

  it('fetches and pushes again when another writer moved main mid-push', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    racingWriter(bare, checkout, 1);

    expect(run(checkout, '--title', 'After the race').code).toBe(0);

    expect(pushesTo(bare)).toBe(2);
    expect(git(bare, 'log', '-1', '--format=%s', 'main^')).toBe('other writer 0');
    expect(boardOn(bare).columns.flatMap((column) => column.cards).map((card) => card.title)).toEqual(['After the race']);
  });

  it('says so when it loses the race twice', () => {
    const bare = remote();
    const checkout = clone(bare, true);
    racingWriter(bare, checkout, 2);

    expect(run(checkout, '--title', 'x')).toEqual({
      code: 1, stdout: '', stderr: 'create-task: the push to origin/main was rejected twice\n',
    });
    expect(pushesTo(bare)).toBe(2);
  });

  it("prints git's sentence and pushes once when the remote declines the push", () => {
    const bare = remote();
    const checkout = clone(bare, true);
    remoteHook(bare, 'pre-receive', 'echo "main is protected" >&2\nexit 1');
    const before = git(bare, 'rev-parse', 'main');

    const result = run(checkout, '--title', 'x');

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('main is protected');
    expect(result.stderr).toContain('pre-receive hook declined');
    expect(pushesTo(bare)).toBe(1);
    expect(git(bare, 'rev-parse', 'main')).toBe(before);
  });
});
