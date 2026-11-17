import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { BOARD_FOLDER_PATH, BOARD_PATHSPECS, hasBoard, peekBoard, readBoard, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';
import { BROKEN_SUFFIX } from '../app/set-aside';
import { ExpectedFailure, failureLine } from '../command/failure-line';
import { defaultBranch, noDefaultBranchMessage } from '../app/default-branch';
import { NO_HOOKS } from '../app/git';
import { droppedConnection, droppedPushReason, lostRace, retryAfter, SYNC_ATTEMPTS } from './board-sync';
import { boardAddArguments, commitMessage, noBoardMessage, parseCreateTaskArguments, type CreateTaskOptions } from './create-task';

// The whole of the create-task program outside create-task.ts: git, the throwaway worktree, the
// file and the terminal. The card goes onto the remote's default branch through a worktree of it
// made for this one commit, so the branch, HEAD, index and working tree it is run from are left
// exactly as they were, and a board change never rides along in a feature branch.
//
// No DASHBOARD_BOARD needed: the board is written in-process by the `board` command's own `add`, so
// this runs the same from a plain terminal, another project or a headless agent.

// What one try ends in: a line to print, a refusal to print, or a push worth another try on a fresh
// fetch after `pause` (retryAfter, the same failures the `board` command tries again). `landed` is
// the commit pushed and the line it would print: a push whose connection dropped may have landed.
type Landed = { commit: string; line: string };
type Outcome = { line: string } | { refusal: string } | { pause: number; landed: Landed };

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

// --seed with no board on the default branch: this checkout's copy when it has one, read and written
// back the way any board is, otherwise the empty board readBoard answers with. Returns the note the
// printed line ends with.
function seedBoard(repositoryRoot: string, worktree: string, branch: string): string {
  const local = peekBoard(repositoryRoot);
  if (local === null) return ` — ${BOARD_FOLDER_PATH} created on ${branch}`;
  writeBoard(worktree, local);
  return ` — ${BOARD_FOLDER_PATH} created on ${branch} from the local copy`;
}

// One try: a worktree of `<remote>/<branch>` as fetched a moment ago, the card added there, one
// commit, one push.
//
// ponytail: a full checkout of the default branch per card. Fine for this repo's size; a sparse
// checkout of .dashboard/ is the next rung if a big repo makes it slow.
function fileOnce(repositoryRoot: string, branch: string, options: CreateTaskOptions, attempt: number): Outcome {
  const worktree = mkdtempSync(join(tmpdir(), 'create-task-'));
  try {
    git(repositoryRoot, [...NO_HOOKS, 'worktree', 'add', '--quiet', '--detach', worktree, `${options.remote}/${branch}`]);
    let seedNote = '';
    if (!hasBoard(worktree)) {
      if (!options.seed) return { refusal: noBoardMessage(options.remote, branch) };
      seedNote = seedBoard(repositoryRoot, worktree, branch);
    }
    const read = readBoard(worktree);
    // readBoard has moved a damaged file aside and answered with an empty board. Writing that back
    // would wipe every card on the default branch.
    if (read.brokenFiles.length > 0) return { refusal: `${options.remote}/${branch} has a board file that does not parse (${read.brokenFiles.map((file) => relative(worktree, file).slice(0, -BROKEN_SUFFIX.length).split(sep).join('/')).join(', ')}); fix it there first` };
    const result = runBoardCommand(read.board, boardAddArguments(options));
    if (!result.ok) return { refusal: result.message };
    // `add` always answers with a changed board; the type only says it might not.
    if (result.board === null) return { refusal: 'add changed nothing' };
    writeBoard(worktree, result.board);
    // What the commit would hold: the card's own file, and on a board still kept in board.json, the
    // move of every card into the folder.
    if (options.dryRun) {
      const staged = git(worktree, [...NO_HOOKS, 'add', '--dry-run', '-A', '--', ...BOARD_PATHSPECS]);
      return { line: `${staged}\n(dry run) would add ${result.output} on ${branch}${seedNote}` };
    }

    // -A, so a board moving out of board.json takes the old file's removal into the same commit as the
    // folder that replaces it: the default branch never holds both, and never neither.
    git(worktree, [...NO_HOOKS, 'add', '-A', '--', ...BOARD_PATHSPECS]);
    git(worktree, [...NO_HOOKS, 'commit', '--quiet', '-m', commitMessage(options.title)]);
    const commit = git(worktree, ['rev-parse', 'HEAD']);
    const line = `${result.output}  on ${branch} (${commit.slice(0, 8)})${seedNote}`;
    try {
      git(worktree, [...NO_HOOKS, 'push', '--quiet', options.remote, `HEAD:refs/heads/${branch}`]);
    } catch (error: unknown) {
      if (!(error instanceof ExpectedFailure)) throw error;
      const pause = retryAfter(attempt, error.message, true);
      if (pause !== null) return { pause, landed: { commit, line } };
      if (lostRace(error.message)) return { refusal: `the push to ${options.remote}/${branch} lost a race to another writer on the last of ${SYNC_ATTEMPTS} tries` };
      if (droppedConnection(error.message)) return { refusal: `${droppedPushReason(`${options.remote}/${branch}`, error.message)}; check ${options.remote}/${branch} for the card before running create-task again` };
      throw error;
    }
    return { line };
  } finally {
    // remove takes the folder and git's record of it; when it fails (the add never ran), both go by hand.
    if (gitOrNull(repositoryRoot, ['worktree', 'remove', '--force', worktree]) === null) {
      rmSync(worktree, { recursive: true, force: true });
      gitOrNull(repositoryRoot, ['worktree', 'prune']);
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
  const repositoryRoot = git(directory, ['rev-parse', '--show-toplevel']);
  const branch = defaultBranch(
    remote,
    gitOrNull(repositoryRoot, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]),
    (name) => gitOrNull(repositoryRoot, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${name}`]) !== null,
  );
  if (branch === null) return refuse(noDefaultBranchMessage(remote));

  // Another writer pushing between the fetch and the push, or a dropped connection, is tried again on
  // a fresh fetch, as the `board` command does. A push that landed with its answer lost is not made
  // again: the fresh fetch holds its commit.
  let landed: Landed | null = null;
  for (let attempt = 1; ; attempt += 1) {
    try {
      git(repositoryRoot, ['fetch', '--quiet', remote, branch]);
    } catch (error: unknown) {
      const pause = error instanceof ExpectedFailure ? retryAfter(attempt, error.message, false) : null;
      if (pause === null) throw error;
      sleep(pause);
      continue;
    }
    if (landed !== null && gitOrNull(repositoryRoot, ['merge-base', '--is-ancestor', landed.commit, `${remote}/${branch}`]) !== null) {
      process.stdout.write(`${landed.line}\n`);
      return 0;
    }
    const outcome = fileOnce(repositoryRoot, branch, options, attempt);
    if ('pause' in outcome) {
      landed = outcome.landed;
      sleep(outcome.pause);
      continue;
    }
    if ('refusal' in outcome) return refuse(outcome.refusal);
    process.stdout.write(`${outcome.line}\n`);
    return 0;
  }
}

// Synchronous, like the rest of this program.
function sleep(milliseconds: number): void {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function runCreateTask(commandArguments: readonly string[], directory: string): number {
  try {
    return run(commandArguments, directory);
  } catch (error: unknown) {
    process.stderr.write(`create-task: ${failureLine(error)}\n`);
    return 1;
  }
}
