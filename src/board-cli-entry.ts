import { openBoard, projectRoot, readBoard, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';

// The whole of the `board` program outside board-cli.ts: the current directory in, a file and a line
// of output out. Every decision it could make is made there instead, where a test can reach it.
//
// The current directory and nothing else to point it — no path to guess and no flag to get wrong;
// `cd` is how you point this at a different project. projectRoot is what makes any depth inside the
// project work, so an agent that has stepped into src/ still edits the project's one board.
const project = projectRoot(process.cwd());
const read = openBoard(project);
if (read.brokenFile !== null) {
  // The same salvage the app does, said out loud. Silence here would look like an empty board.
  process.stderr.write(`board.json was damaged and has been kept as ${read.brokenFile}\n`);
}

const args = process.argv.slice(2);
// Run twice when there is something to write: once on the board this process opened, and again on the
// board as it stands a moment before the write. The app saves the whole file on every keystroke, so
// the board read at startup can be tens of milliseconds stale by the time the write goes out — and
// writing the whole file back from it puts the board from before that keystroke over the top of it.
// What that costs: somebody types a comment on a card and presses Escape while this is running, the
// write lands after them, and their line is gone off the screen they just typed it on.
//
// ponytail: read-then-write, so a save landing inside the last microseconds still wins. A lock is the
// next rung, when two writers are common enough to hit that window.
const opened = runBoardCommand(read.board, args);
const result = opened.ok && opened.board !== null ? runBoardCommand(readBoard(project).board, args) : opened;
if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exit(1);
}

// Written before the line is printed, so a failed write is what you see rather than a success
// message about a change that is not on disk.
if (result.board !== null) writeBoard(project, result.board);
process.stdout.write(`${result.output}\n`);
