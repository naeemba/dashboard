import { existsSync } from 'node:fs';
import { runBoardProgram } from '../board/board-program';
import { runProjectProgram } from '../projects/project-program';
import { runSessionProgram } from '../workers/session-program';
import { routeDashboardCommand } from './dashboard-cli';
import { appStarter, appStartRefusal } from './start-app';

// The file DASHBOARD_COMMAND names and the `dashboard` launcher runs: `dashboard <noun> <verb> ...`.
// Which noun is dashboard-cli.ts's decision; this only runs the program it names.
async function run(): Promise<number> {
  const route = routeDashboardCommand(process.argv.slice(2));
  switch (route.kind) {
    case 'help':
      process.stdout.write(`${route.text}\n`);
      return 0;
    case 'refused':
      process.stderr.write(`${route.message}\n`);
      return 1;
    case 'app': {
      const start = appStarter(process.env);
      if (start === null) {
        process.stderr.write(`${appStartRefusal(process.env.DASHBOARD_APP, existsSync)}\n`);
        return 1;
      }
      start(route.appArguments);
      return 0;
    }
    case 'program':
      switch (route.noun) {
        case 'board': return runBoardProgram(route.commandArguments);
        case 'pane': return runSessionProgram(route.commandArguments);
        case 'project': return runProjectProgram(route.commandArguments);
      }
  }
}

void run().then((code) => { process.exitCode = code; });
