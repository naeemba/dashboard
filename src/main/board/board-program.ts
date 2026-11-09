import { isManagerHomeDirectory, openBoard, projectRoot, readBoard, writeBoard } from './board-store';
import { failureLine } from '../command/failure-line';
import { projectNamedInFile } from '../projects/project-named';
import { asksApp, BOARD_REQUEST, brokenFilesRefusal, readsBoard, runBoardCommand, runBoardCommandOnLatest, type CommandResult } from './board-cli';
import { syncBoard, type BoardSync } from './board-sync-git';
import { notSyncedWarning } from './board-sync';
import { rebaseBoardChange } from '../../shared/board/board-merge';
import { failureText } from '../../shared/errors/failure';
import type { Board } from '../../shared/board/board';
import { askRunningApp } from '../workers/session-socket';
import { boardTarget } from './board-target';
import { isLinkedWorktree } from './linked-worktree';

// The whole of the `board` program outside board-cli.ts: the current directory and the words in, a
// file and a line of output out, and the exit code back. Every decision it could make is made there
// instead, where a test can reach it. Two doors run it: board-cli-entry.ts, the file DASHBOARD_BOARD
// names, and `dashboard board`.
//
// The current directory points it, or --project and a name from ~/.dashboard/projects.yaml; which one
// is board-target.ts's to say. projectRoot is what makes any depth inside the project work, so an
// agent that has stepped into src/ still edits the project's one board.
async function run(words: readonly string[]): Promise<number> {
  const target = boardTarget(words, process.cwd(), { isHome: isManagerHomeDirectory, projectRoot, named: projectNamedInFile });
  if (!target.ok) {
    process.stderr.write(`${target.message}\n`);
    return 1;
  }
  const { project, commandArguments } = target;
  // A ship, a review and a move into Ship or Review are the app's to do, so the screen, the command
  // and the sweep all mean the same thing by one; docs/actions/README.md says why. The app is started
  // when none answers. asksApp says which; on a worktree's board a move is only a move.
  if (asksApp(commandArguments, !isLinkedWorktree(project))) {
    const [verb, ...rest] = commandArguments;
    return askRunningApp([BOARD_REQUEST, verb, project, ...rest]);
  }
  // Without salvage: a file that does not parse stays where it is under its own name, so every run
  // refuses until it is fixed. readBoard says why a rename here would commit the card as deleted.
  const read = openBoard(project, false);
  if (read.brokenFiles.length > 0) {
    process.stderr.write(`${brokenFilesRefusal(read.brokenFiles)}\n`);
    return 1;
  }

  // A board git tracks is read and written on origin's default branch, and this checkout brought up to
  // it (board-sync-git.ts). The id is made once, so an `add` retried on a fresh fetch is one card. A
  // sync that throws is one more way of not reaching origin: the board is written here, with the warning.
  const id = crypto.randomUUID();
  const makeId = () => id;
  if (readsBoard(commandArguments)) {
    // Each board the command ran on and what it answered; the last is what went up, when a lost race retried.
    const tries: { before: Board; result: CommandResult }[] = [];
    const sync = await syncBoard(project, (board) => {
      const result = runBoardCommand(board, commandArguments, makeId);
      tries.push({ before: board, result });
      return result.ok && result.board !== null ? result.board : board;
    }).catch((error: unknown): BoardSync => ({ synced: false, warning: notSyncedWarning(failureText(error)) }));
    const onOrigin = tries.at(-1);
    if (sync.synced && onOrigin !== undefined) {
      const { before, result } = onOrigin;
      // A checkout the sync could not move holds the edit as well, as it did before there was a sync:
      // the same change, not the command run again, whose new timestamps the next sync would publish as
      // a second comment.
      if (sync.checkout === 'stale' && result.ok && result.board !== null) {
        writeBoard(project, rebaseBoardChange(before, result.board, readBoard(project, false).board));
      }
      return answer(result);
    }
    if (!sync.synced && sync.warning !== null) process.stderr.write(`${sync.warning}\n`);
  }
  return answer(writeHere(project, read.board, commandArguments, makeId));
}

// The command run on this folder's board and written here. Against the board as it stands a moment
// before the write, not the one opened: runBoardCommandOnLatest says why. Written before the line is
// printed, so a failed write is what you see rather than a success message about a change that is not
// on disk.
function writeHere(project: string, opened: Board, commandArguments: readonly string[], makeId: () => string): CommandResult {
  const result = runBoardCommandOnLatest(opened, commandArguments, () => readBoard(project, false).board, makeId);
  if (result.ok && result.board !== null) writeBoard(project, result.board);
  return result;
}

function answer(result: CommandResult): number {
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    return 1;
  }
  process.stdout.write(`${result.output}\n`);
  return 0;
}

// One door out for every failure: a line on stderr and exit 1, the same shape a refused command
// already uses. The reads and the write are the paths that throw — a board that cannot be read, a
// board that cannot be replaced — and without this those two are the only ones that answer an agent
// with a node stack trace instead of a sentence. What the line says is failureLine's decision, in
// command/failure-line.ts, shared by every program the dashboard command runs.
export async function runBoardProgram(commandArguments: readonly string[]): Promise<number> {
  try {
    return await run(commandArguments);
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
