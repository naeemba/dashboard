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

// The request line is already written when the command gives up, so the app may still read it and act
// on it: an older app answers without ACCEPTED, and a busy one gets to it late.
export function unacceptedLine(milliseconds: number): string {
  return `the running Dashboard did not answer within ${milliseconds / 1000} seconds — `
    + 'it is most likely older than this command and needs a restart, and it may still act on the request: '
    + 'check `pane list` after restarting before asking again';
}

// Why the app will not answer a command of another build, or undefined when it will. A command older
// than the version stamp sends none. notify is let through whatever its stamp: it is what a worker's
// hooks send, a refusal there goes to a hook log nobody reads, and the worker would stay running for
// good with its main never told. Its words have not changed, and a state the app does not know is
// refused by parseSessionCommand all the same.
export function versionRefusal(appVersion: string, commandVersion: unknown, commandArguments: readonly string[]): string | undefined {
  if (commandVersion === appVersion || commandArguments[0] === 'notify') return undefined;
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
