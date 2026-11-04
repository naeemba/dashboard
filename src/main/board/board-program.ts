import { isManagerHomeDirectory, openBoard, projectRoot, readBoard, writeBoard } from './board-store';
import { failureLine } from '../command/failure-line';
import { projectNamedInFile } from '../projects/project-named';
import { runBoardCommandOnLatest } from './board-cli';
import { boardTarget } from './board-target';

// The whole of the `board` program outside board-cli.ts: the current directory and the words in, a
// file and a line of output out, and the exit code back. Every decision it could make is made there
// instead, where a test can reach it. Two doors run it: board-cli-entry.ts, the file DASHBOARD_BOARD
// names, and `dashboard board`.
//
// The current directory points it, or --project and a name from ~/.dashboard/projects.yaml; which one
// is board-target.ts's to say. projectRoot is what makes any depth inside the project work, so an
// agent that has stepped into src/ still edits the project's one board.
function run(words: readonly string[]): number {
  const target = boardTarget(words, process.cwd(), { isHome: isManagerHomeDirectory, projectRoot, named: projectNamedInFile });
  if (!target.ok) {
    process.stderr.write(`${target.message}\n`);
    return 1;
  }
  const { project, commandArguments } = target;
  // Without salvage: a file that does not parse stays where it is under its own name, so every run
  // refuses until it is fixed. readBoard says why a rename here would commit the card as deleted.
  const read = openBoard(project, false);
  if (read.brokenFiles.length > 0) {
    process.stderr.write(`board files do not parse, nothing was written; fix them first: ${read.brokenFiles.join(', ')}\n`);
    return 1;
  }

  // Run against the board as it stands a moment before the write, not the one opened above:
  // runBoardCommandOnLatest says why.
  const result = runBoardCommandOnLatest(read.board, commandArguments, () => readBoard(project, false).board);
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
// command/failure-line.ts, shared by every program the dashboard command runs.
export function runBoardProgram(commandArguments: readonly string[]): number {
  try {
    return run(commandArguments);
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
