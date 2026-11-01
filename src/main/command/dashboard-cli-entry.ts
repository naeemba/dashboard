import { runBoardProgram } from '../board/board-program';
import { runProjectProgram } from '../projects/project-program';
import { runSessionProgram } from '../workers/session-program';
import { routeDashboardCommand } from './dashboard-cli';

// The file DASHBOARD_COMMAND names: `node "$DASHBOARD_COMMAND" <noun> <verb> ...`. Which noun is
// dashboard-cli.ts's decision; this only runs the program it names.
async function run(): Promise<number> {
  const route = routeDashboardCommand(process.argv.slice(2));
  if (!route.ok) {
    process.stderr.write(`${route.message}\n`);
    return 1;
  }
  switch (route.noun) {
    case 'board': return runBoardProgram(route.commandArguments);
    case 'pane': return runSessionProgram(route.commandArguments);
    case 'project': return runProjectProgram(route.commandArguments);
  }
}

void run().then((code) => { process.exitCode = code; });
