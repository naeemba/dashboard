import { projectNamedInFile } from '../projects/project-named';
import { askRunningApp } from '../workers/session-socket';
import { BROWSER_REQUEST, OUTSIDE_PANE, parseBrowserCommand } from './browser-cli';

// The whole of the `browser` program outside browser-cli.ts and the app: the words parsed, a project
// name found in ~/.dashboard/projects.yaml, and the command sent for the pane it runs in. `dashboard
// browser` is its one door.
export async function runBrowserProgram(words: readonly string[]): Promise<number> {
  const parsed = parseBrowserCommand(words);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    return 1;
  }
  // Every pane the app opens carries these, and nothing else does.
  const pane = process.env.DASHBOARD_PANE;
  const paneProject = process.env.DASHBOARD_PANE_PROJECT;
  if (!pane || !paneProject || process.env.DASHBOARD_SOCKET === undefined) {
    process.stderr.write(`${OUTSIDE_PANE}\n`);
    return 1;
  }
  let { command } = parsed;
  if ('project' in command && command.project !== null) {
    const named = projectNamedInFile(command.project);
    if (!named.ok) {
      process.stderr.write(`${named.message}\n`);
      return 1;
    }
    command = { ...command, project: named.path };
  }
  return askRunningApp([BROWSER_REQUEST, pane, JSON.stringify(command), paneProject]);
}
