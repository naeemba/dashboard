import { hookArguments, olderNotifyArguments, outsidePaneRefusal, parseSessionCommand, readsHookInput } from './session-cli';
import { askRunningApp } from './session-socket';

// The whole of the `session` program outside session-cli.ts and the app: the arguments and the folder
// out, a line back. A spelling mistake, and a claim outside a pane that names no project, are answered
// here, without the app; everything else is the app's to decide, because the panes are its. Two doors
// run it: session-cli-entry.ts, the file DASHBOARD_SESSION names, and `dashboard pane`.
export async function runSessionProgram(given: readonly string[]): Promise<number> {
  // A hook hands its input on stdin. A terminal has none to hand, and reading one would wait for good,
  // so a --stop-input typed by hand sends no counts.
  const input = readsHookInput(given) && !process.stdin.isTTY ? await readStdin() : undefined;
  const commandArguments = hookArguments(given, input);
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
  const asked = await askRunningApp(commandArguments);
  // An app older than this command refuses the words a hook grew; its older words still turn the pane.
  const older = olderNotifyArguments(commandArguments);
  return asked !== 0 && older.length !== commandArguments.length ? askRunningApp(older) : asked;
}

async function readStdin(): Promise<string> {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}
