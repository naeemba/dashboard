import { isManagerHomeDirectory, openBoard, projectRoot, readBoard, writeBoard } from './board-store';
import { failureLine, homeDirectoryRefusal, runBoardCommandOnLatest } from './board-cli';

// The whole of the `board` program outside board-cli.ts: the current directory and the words in, a
// file and a line of output out, and the exit code back. Every decision it could make is made there
// instead, where a test can reach it. Two doors run it: board-cli-entry.ts, the file DASHBOARD_BOARD
// names, and `dashboard board`.
//
// The current directory and nothing else to point it — no path to guess and no flag to get wrong;
// `cd` is how you point this at a different project. projectRoot is what makes any depth inside the
// project work, so an agent that has stepped into src/ still edits the project's one board.
function run(commandArguments: readonly string[]): number {
  if (isManagerHomeDirectory(process.cwd())) {
    process.stderr.write(`${homeDirectoryRefusal()}\n`);
    return 1;
  }

  const project = projectRoot(process.cwd());
  const read = openBoard(project);
  if (read.brokenFile !== null) {
    // The same salvage the app does, said out loud. Silence here would look like an empty board.
    process.stderr.write(`board.json was damaged and has been kept as ${read.brokenFile}\n`);
  }

  // Run against the board as it stands a moment before the write, not the one opened above:
  // runBoardCommandOnLatest says why.
  const result = runBoardCommandOnLatest(read.board, commandArguments, () => readBoard(project).board);
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    return 1;
  }

  // Written before the line is printed, so a failed write is what you see rather than a success
  // message about a change that is not on disk.
  if (result.board !== null) writeBoard(project, result.board);
  process.stdout.write(`${result.output}\n`);
  return 0;
}

// One door out for every failure: a line on stderr and exit 1, the same shape a refused command
// already uses. The reads and the write are the paths that throw — a board that cannot be read, a
// board that cannot be replaced — and without this those two are the only ones that answer an agent
// with a node stack trace instead of a sentence. What the line says is failureLine's decision, in
// board-cli.ts with the rest of them.
export function runBoardProgram(commandArguments: readonly string[]): number {
  try {
    return run(commandArguments);
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
