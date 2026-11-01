import { runBoardProgram } from './board-program';

// The file DASHBOARD_BOARD names. Kept, with the same words, for every shell and skill that runs
// `node "$DASHBOARD_BOARD" <command>`; `dashboard board <command>` is the same program.
process.exitCode = runBoardProgram(process.argv.slice(2));
