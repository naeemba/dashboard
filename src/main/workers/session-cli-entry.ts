import { runSessionProgram } from './session-program';

// The file DASHBOARD_SESSION names. Kept, with the same words, for every shell, skill and worker hook
// that runs `node "$DASHBOARD_SESSION" <command>`; `dashboard pane <command>` is the same program.
void runSessionProgram(process.argv.slice(2)).then((code) => { process.exitCode = code; });
