import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BOARD_FILE_PATH, readBoard, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';
import { failureLine } from '../command/failure-line';
import {
  boardAddArguments,
  commitMessage,
  defaultBranch,
  noBoardMessage,
  noDefaultBranchMessage,
  parseCreateTaskArguments,
  type CreateTaskOptions,
} from './create-task';

// The whole of the create-task program outside create-task.ts: git, the throwaway worktree, the
// file and the terminal. The card goes onto the remote's default branch through a worktree of it
// made for this one commit, so the branch, HEAD, index and working tree it is run from are left
// exactly as they were, and a board change never rides along in a feature branch.
//
// No DASHBOARD_BOARD needed: the board is written in-process by the `board` command's own `add`, so
// this runs the same from a plain terminal, another project or a headless agent.

type Outcome = { pushed: true; line: string } | { pushed: false; refusal?: string };

// A git failure carries a code so failureLine prints git's own sentence, not a node stack.
function git(directory: string, commandArguments: readonly string[]): string {
  try {
    return execFileSync('git', commandArguments, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (error: unknown) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    throw Object.assign(new Error(stderr || `git ${commandArguments[0]} failed`), { code: 'GIT_FAILED' });
  }
}

function gitOrNull(directory: string, commandArguments: readonly string[]): string | null {
  try {
    return git(directory, commandArguments);
  } catch {
    return null;
  }
}

// One try: a worktree of `<remote>/<branch>` as fetched a moment ago, the card added there, one
// commit, one push. pushed false with no refusal means the push lost a race and is worth retrying.
//
// ponytail: a full checkout of the default branch per card. Fine for this repo's size; a sparse
// checkout of .dashboard/ is the next rung if a big repo makes it slow.
function fileOnce(top: string, branch: string, options: CreateTaskOptions): Outcome {
  const worktree = mkdtempSync(join(tmpdir(), 'create-task-'));
  try {
    git(top, ['worktree', 'add', '--quiet', '--detach', worktree, `${options.remote}/${branch}`]);
    const boardFile = join(worktree, BOARD_FILE_PATH);
    let seedNote = '';
    if (!existsSync(boardFile)) {
      if (!options.seed) return { pushed: false, refusal: noBoardMessage(options.remote, branch) };
      seedNote = ` — ${BOARD_FILE_PATH} created on ${branch}`;
      const local = join(top, BOARD_FILE_PATH);
      if (existsSync(local)) {
        mkdirSync(dirname(boardFile), { recursive: true });
        copyFileSync(local, boardFile);
        seedNote += ' from the local copy';
      }
    }
    const read = readBoard(worktree);
    // readBoard has moved a damaged file aside and answered with an empty board. Writing that back
    // would wipe every card on the default branch.
    if (read.brokenFile !== null) return { pushed: false, refusal: `${options.remote}/${branch} has a ${BOARD_FILE_PATH} that does not parse; fix it there first` };
    const result = runBoardCommand(read.board, boardAddArguments(options));
    if (!result.ok) return { pushed: false, refusal: result.message };
    // `add` always changes the board.
    const text = writeBoard(worktree, result.board ?? read.board);
    if (options.dryRun) return { pushed: true, line: `${text}\n(dry run) would add ${result.output} on ${branch}${seedNote}` };

    git(worktree, ['add', BOARD_FILE_PATH]);
    // --no-verify: the project's commit hooks are for its code, and this commit is one card.
    git(worktree, ['commit', '--quiet', '--no-verify', '-m', commitMessage(options.title)]);
    if (gitOrNull(worktree, ['push', '--quiet', options.remote, `HEAD:refs/heads/${branch}`]) === null) return { pushed: false };
    const commit = git(worktree, ['rev-parse', '--short=8', 'HEAD']);
    return { pushed: true, line: `${result.output}  on ${branch} (${commit})${seedNote}` };
  } finally {
    gitOrNull(top, ['worktree', 'remove', '--force', worktree]);
    rmSync(worktree, { recursive: true, force: true });
    gitOrNull(top, ['worktree', 'prune']);
  }
}

function run(commandArguments: readonly string[], directory: string): number {
  const parsed = parseCreateTaskArguments(commandArguments);
  if ('message' in parsed) {
    process.stderr.write(`create-task: ${parsed.message}\n`);
    return 1;
  }
  const { options } = parsed;
  const top = git(directory, ['rev-parse', '--show-toplevel']);
  const branch = defaultBranch(
    options.remote,
    (remote) => gitOrNull(top, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]),
    (remote, name) => gitOrNull(top, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${name}`]) !== null,
  );
  if (branch === null) {
    process.stderr.write(`create-task: ${noDefaultBranchMessage(options.remote)}\n`);
    return 1;
  }

  // Two attempts: somebody else pushing to the default branch between the fetch and the push is the
  // one failure worth retrying, and fetching again fixes it.
  for (let attempt = 1; ; attempt += 1) {
    git(top, ['fetch', '--quiet', options.remote, branch]);
    const outcome = fileOnce(top, branch, options);
    if (outcome.pushed) {
      process.stdout.write(`${outcome.line}\n`);
      return 0;
    }
    if (outcome.refusal !== undefined || attempt === 2) {
      process.stderr.write(`create-task: ${outcome.refusal ?? `the push to ${options.remote}/${branch} was rejected twice`}\n`);
      return 1;
    }
  }
}

export function runCreateTask(commandArguments: readonly string[], directory: string): number {
  try {
    return run(commandArguments, directory);
  } catch (error: unknown) {
    process.stderr.write(`create-task: ${failureLine(error)}\n`);
    return 1;
  }
}
