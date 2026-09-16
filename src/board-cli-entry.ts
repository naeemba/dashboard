import { openBoard, projectRoot, readBoard, writeBoard } from './board-store';
import { runBoardCommandOnLatest } from './board-cli';

// The whole of the `board` program outside board-cli.ts: the current directory in, a file and a line
// of output out. Every decision it could make is made there instead, where a test can reach it.
//
// The current directory and nothing else to point it — no path to guess and no flag to get wrong;
// `cd` is how you point this at a different project. projectRoot is what makes any depth inside the
// project work, so an agent that has stepped into src/ still edits the project's one board.
function run(): void {
  const project = projectRoot(process.cwd());
  const read = openBoard(project);
  if (read.brokenFile !== null) {
    // The same salvage the app does, said out loud. Silence here would look like an empty board.
    process.stderr.write(`board.json was damaged and has been kept as ${read.brokenFile}\n`);
  }

  const args = process.argv.slice(2);
  // Run against the board as it stands a moment before the write, not the one opened above:
  // runBoardCommandOnLatest says why.
  const result = runBoardCommandOnLatest(read.board, args, () => readBoard(project).board);
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    process.exit(1);
  }

  // Written before the line is printed, so a failed write is what you see rather than a success
  // message about a change that is not on disk.
  if (result.board !== null) writeBoard(project, result.board);
  process.stdout.write(`${result.output}\n`);
}

// One door out for every failure: a line on stderr and exit 1, the same shape a refused command
// already uses. The reads and the write are the paths that throw — a board that cannot be read, a
// board that cannot be replaced — and without this those two are the only ones that answer an agent
// with a node stack trace instead of a sentence.
//
// The shape of the error picks which one you get. Every fs failure carries an errno `code`, and those
// are the ones a sentence answers: nothing about `EACCES: permission denied, open '.dashboard/board.json'`
// gets clearer with a stack. Anything without a code is a bug in here, and a bug printed as one
// sentence leaves an agent `Cannot read properties of undefined (reading 'title')` and no file to open,
// so those keep their stack.
try {
  run();
} catch (error: unknown) {
  const failure = error as NodeJS.ErrnoException;
  process.stderr.write(`${failure?.code ? failure.message : (failure?.stack ?? String(error))}\n`);
  process.exit(1);
}
