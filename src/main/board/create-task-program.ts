import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { BOARD_FOLDER_PATH, BOARD_PATHSPECS, hasBoard, peekBoard, readBoard, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';
import { BROKEN_SUFFIX } from './board-files';
import { ExpectedFailure, failureLine } from '../command/failure-line';
import { defaultBranch, noDefaultBranchMessage } from '../app/default-branch';
import { NO_HOOKS, boardAddArguments, commitMessage, lostRace, noBoardMessage, parseCreateTaskArguments, type CreateTaskOptions } from './create-task';

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
function fileOnce(repositoryRoot: string, branch: string, options: CreateTaskOptions): Outcome {
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
    try {
      git(worktree, [...NO_HOOKS, 'push', '--quiet', options.remote, `HEAD:refs/heads/${branch}`]);
    } catch (error: unknown) {
      // Only a lost race is worth a fresh fetch; anything else is git's own sentence.
      if (error instanceof ExpectedFailure && lostRace(error.message)) return 'retry';
      throw error;
    }
    const commit = git(worktree, ['rev-parse', '--short=8', 'HEAD']);
    return { line: `${result.output}  on ${branch} (${commit})${seedNote}` };
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

  // Two tries: somebody else pushing to the default branch between the fetch and the push is the
  // one failure worth retrying, and fetching again fixes it.
  for (let tries = 0; tries < 2; tries += 1) {
    git(repositoryRoot, ['fetch', '--quiet', remote, branch]);
    const outcome = fileOnce(repositoryRoot, branch, options);
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
