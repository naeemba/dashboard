import { readBoard, seedBoardDirectory, writeBoard } from './board-store';
import { runBoardCommand } from './board-cli';

// The whole of the `board` program outside board-cli.ts: the current directory in, a file and a line
// of output out. Every decision it could make is made there instead, where a test can reach it.
//
// The current directory and nothing else. An agent works a card from the root of its worktree, which
// is the project, so there is no path to guess and no flag to get wrong; `cd` is how you point this
// at a different project.
const read = readBoard(process.cwd());
if (read.brokenFile !== null) {
  // The same salvage the app does, said out loud. Silence here would look like an empty board.
  process.stderr.write(`board.json was damaged and has been kept as ${read.brokenFile}\n`);
}

const result = runBoardCommand(read.board, process.argv.slice(2));
if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exit(1);
}

// Written before the line is printed, so a failed write is what you see rather than a success
// message about a change that is not on disk.
if (result.board !== null) {
  // Seeded the same way a first Ctrl+B seeds it, so a folder that gains a board.json from here also
  // gains the file next to it that says what a card looks like.
  try {
    seedBoardDirectory(process.cwd());
  } catch {
    // No explanation files this time; the board still saves.
  }
  writeBoard(process.cwd(), result.board);
}
if (result.output !== '') process.stdout.write(`${result.output}\n`);
