import { parseSessionCommand } from './session-cli';
import { askApp } from './session-socket';

// The whole of the `session` program outside session-cli.ts and the app: the arguments and the folder
// out, a line back. A spelling mistake is answered here, without the app; everything else is the
// app's to decide, because the panes are its.
async function run(): Promise<number> {
  const args = process.argv.slice(2);
  const parsed = parseSessionCommand(args);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    return 1;
  }
  const socket = process.env.DASHBOARD_SOCKET;
  if (!socket) {
    process.stderr.write('DASHBOARD_SOCKET is not set — run this from a pane the Dashboard app opened\n');
    return 1;
  }
  const reply = await askApp(socket, { directory: process.cwd(), args });
  if (reply.output !== '') (reply.ok ? process.stdout : process.stderr).write(`${reply.output}\n`);
  return reply.ok ? 0 : 1;
}

void run().then((code) => { process.exitCode = code; });
