import type net from 'node:net';

// What a command and the app it asks agree on before any answer: that they are the same build, and
// that the app took the request at all.
//
// A rebuild swaps the command files under an app that is still running the old build, and the two can
// disagree on how a request ends. When the command started ending its request with a newline instead
// of closing its side, the old app kept waiting for the close, the command kept waiting for the
// answer, and `pane list` hung with no output until someone killed it. So the request carries the
// command's build stamp and the app refuses any other, and the app says it took the request the moment
// it has read it. A command that hears nothing in ACCEPTANCE_TIMEOUT stops waiting and says why.

// Long enough for an app busy with its own work, short enough that nobody reaches for Ctrl-C. Only the
// acceptance is timed: the answer itself can take as long as a worktree takes to make.
export const ACCEPTANCE_TIMEOUT = 5000;

// What the app writes once it has read a request it will answer. A bare newline, so the answer that
// follows still parses as JSON with it in front.
export const ACCEPTED = '\n';

export function unacceptedLine(milliseconds: number): string {
  return `the running Dashboard did not take the request within ${milliseconds / 1000} seconds — `
    + 'it is most likely older than this command and needs a restart';
}

// Why the app will not answer a command of another build, or undefined when it will. A command older
// than the version stamp sends none.
export function versionRefusal(appVersion: string, commandVersion: unknown): string | undefined {
  if (commandVersion === appVersion) return undefined;
  const command = typeof commandVersion === 'string' ? `v${commandVersion}` : 'an older build';
  return `this command is ${command} and the running Dashboard is v${appVersion} — restart the app`;
}

// Calls silent once, and destroys the connection, when nothing comes back on it in time.
export function awaitAcceptance(connection: net.Socket, milliseconds: number, silent: () => void): void {
  const timer = setTimeout(() => {
    connection.destroy();
    silent();
  }, milliseconds);
  const heard = () => clearTimeout(timer);
  connection.once('data', heard);
  connection.once('close', heard);
}
