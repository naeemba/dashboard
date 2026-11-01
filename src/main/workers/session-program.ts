import { parseSessionCommand } from './session-cli';
import { askAppFromPane } from './session-socket';

// The whole of the `session` program outside session-cli.ts and the app: the arguments and the folder
// out, a line back. A spelling mistake is answered here, without the app; everything else is the
// app's to decide, because the panes are its. Two doors run it: session-cli-entry.ts, the file
// DASHBOARD_SESSION names, and `dashboard pane`.
export async function runSessionProgram(commandArguments: readonly string[]): Promise<number> {
  const parsed = parseSessionCommand(commandArguments);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    return 1;
  }
  return askAppFromPane(commandArguments);
}
