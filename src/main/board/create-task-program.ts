import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BOARD_FILE_PATH, readBoard, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';
import { ExpectedFailure, failureLine } from '../command/failure-line';
import { defaultBranch, noDefaultBranchMessage } from '../app/default-branch';
import { boardAddArguments, commitMessage, noBoardMessage, parseCreateTaskArguments, type CreateTaskOptions } from './create-task';

// The whole of the create-task program outside create-task.ts: git, the throwaway worktree, the
// file and the terminal. The card goes onto the remote's default branch through a worktree of it
// made for this one commit, so the branch, HEAD, index and working tree it is run from are left
// exactly as they were, and a board change never rides along in a feature branch.
//
// No DASHBOARD_BOARD needed: the board is written in-process by the `board` command's own `add`, so
// this runs the same from a plain terminal, another project or a headless agent.

// What one try ends in: a line to print, a refusal to print, or a push that lost a race to another
// writer and is worth one more try on a fresh fetch.
type Outcome = { line: string } | { refusal: string } | 'retry';

// Sync, unlike app/git.ts: this is a short-lived program with nothing else to keep running. The
// output read here is always one line, so trim is safe. A failure is git's own sentence.
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
    throw new ExpectedFailure(stderr || `git ${commandArguments[0]} failed`);
  }
}

function gitOrNull(directory: string, commandArguments: readonly string[]): string | null {
  try {
    return git(directory, commandArguments);
  } catch {
    return null;
  }
}

// --seed with no board on the default branch: this checkout's copy when it has one, otherwise the
// empty board readBoard answers with. Returns the note the printed line ends with.
function seedBoard(top: string, boardFile: string, branch: string): string {
  const local = join(top, BOARD_FILE_PATH);
  if (!existsSync(local)) return ` — ${BOARD_FILE_PATH} created on ${branch}`;
  mkdirSync(dirname(boardFile), { recursive: true });
  copyFileSync(local, boardFile);
  return ` — ${BOARD_FILE_PATH} created on ${branch} from the local copy`;
}

// One try: a worktree of `<remote>/<branch>` as fetched a moment ago, the card added there, one
// commit, one push.
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
      if (!options.seed) return { refusal: noBoardMessage(options.remote, branch) };
      seedNote = seedBoard(top, boardFile, branch);
    }
    const read = readBoard(worktree);
    // readBoard has moved a damaged file aside and answered with an empty board. Writing that back
    // would wipe every card on the default branch.
    if (read.brokenFile !== null) return { refusal: `${options.remote}/${branch} has a ${BOARD_FILE_PATH} that does not parse; fix it there first` };
    const result = runBoardCommand(read.board, boardAddArguments(options));
    if (!result.ok) return { refusal: result.message };
    // `add` always answers with a changed board; the type only says it might not.
    if (result.board === null) return { refusal: 'add changed nothing' };
    const text = writeBoard(worktree, result.board);
    if (options.dryRun) return { line: `${text}\n(dry run) would add ${result.output} on ${branch}${seedNote}` };

    git(worktree, ['add', BOARD_FILE_PATH]);
    // --no-verify: the project's commit hooks are for its code, and this commit is one card.
    git(worktree, ['commit', '--quiet', '--no-verify', '-m', commitMessage(options.title)]);
    if (gitOrNull(worktree, ['push', '--quiet', options.remote, `HEAD:refs/heads/${branch}`]) === null) return 'retry';
    const commit = git(worktree, ['rev-parse', '--short=8', 'HEAD']);
    return { line: `${result.output}  on ${branch} (${commit})${seedNote}` };
  } finally {
    // remove takes the folder and git's record of it; when it fails (the add never ran), both go by hand.
    if (gitOrNull(top, ['worktree', 'remove', '--force', worktree]) === null) {
      rmSync(worktree, { recursive: true, force: true });
      gitOrNull(top, ['worktree', 'prune']);
    }
  }
}

function refuse(message: string): number {
  process.stderr.write(`create-task: ${message}\n`);
  return 1;
}

function run(commandArguments: readonly string[], directory: string): number {
  const parsed = parseCreateTaskArguments(commandArguments);
  if ('message' in parsed) return refuse(parsed.message);
  const { options } = parsed;
  const { remote } = options;
  const top = git(directory, ['rev-parse', '--show-toplevel']);
  const branch = defaultBranch(
    remote,
    gitOrNull(top, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]),
    (name) => gitOrNull(top, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${name}`]) !== null,
  );
  if (branch === null) return refuse(noDefaultBranchMessage(remote));

  // Two tries: somebody else pushing to the default branch between the fetch and the push is the
  // one failure worth retrying, and fetching again fixes it.
  for (let tries = 0; tries < 2; tries += 1) {
    git(top, ['fetch', '--quiet', remote, branch]);
    const outcome = fileOnce(top, branch, options);
    if (outcome === 'retry') continue;
    if ('refusal' in outcome) return refuse(outcome.refusal);
    process.stdout.write(`${outcome.line}\n`);
    return 0;
  }
  return refuse(`the push to ${remote}/${branch} was rejected twice`);
}

export function runCreateTask(commandArguments: readonly string[], directory: string): number {
  try {
    return run(commandArguments, directory);
  } catch (error: unknown) {
    process.stderr.write(`create-task: ${failureLine(error)}\n`);
    return 1;
  }
}
