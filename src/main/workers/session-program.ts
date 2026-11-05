import { outsidePaneRefusal, parseSessionCommand, stopInputArguments } from './session-cli';
import { askRunningApp } from './session-socket';

// The whole of the `session` program outside session-cli.ts and the app: the arguments and the folder
// out, a line back. A spelling mistake, and a claim outside a pane that names no project, are answered
// here, without the app; everything else is the app's to decide, because the panes are its. Two doors
// run it: session-cli-entry.ts, the file DASHBOARD_SESSION names, and `dashboard pane`.
export async function runSessionProgram(commandArguments: readonly string[]): Promise<number> {
  const parsed = parseSessionCommand(commandArguments);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    return 1;
  }
  // DASHBOARD_SOCKET is what every pane the app opens carries, and nothing else does.
  const refusal = process.env.DASHBOARD_SOCKET === undefined ? outsidePaneRefusal(parsed.command) : null;
  if (refusal !== null) {
    process.stderr.write(`${refusal}\n`);
    return 1;
  }
  // A Stop hook hands its input on stdin. The app is sent the counts, never the input itself.
  if (parsed.command.kind === 'notify' && parsed.command.stopInput) {
    return askRunningApp([...commandArguments.slice(0, 3), ...stopInputArguments(await readStdin())]);
  }
  return askRunningApp(commandArguments);
}

async function readStdin(): Promise<string> {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}
