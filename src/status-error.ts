import type { DashboardBridge } from './bridge';
import { shouldLogError } from './error-log';
import { failureNotice } from './failure';

export type StatusError = {
  element: HTMLElement;
  show(owner: string, message: string): void;
  notice(owner: string, message: string): void;
};

// The status bar's error span. Out of renderer.ts, which had reached its 600-line ceiling.
//
// Its own span, between the two, because renderStatus() rewrites the pane label on every keystroke.
// A message written into that span is gone by the next arrow key, which is how the salvage notice
// used to disappear before anyone could read it.
//
// Whoever wrote the message on screen owns it, and only that owner may clear it. Without the owner a
// clean read anywhere clears everything: open a read-only project, get `Board not saved: EACCES`, then
// look at another project's board and the message is gone while the card still is not on disk.
//
// A failure goes through show, and is also a line in the log, which is the one place every error a
// person sees already passes through. Everything else the bar says — a hint, a refusal, progress like
// `shipping "Fix login"…` — goes through notice, which draws the same and logs nothing: logged, every
// ship would leave a red error line behind it and the log would read as a list of key presses.
export function createStatusError(bridge: DashboardBridge): StatusError {
  const element = document.createElement('span');
  element.className = 'error';
  let errorOwner = '';

  function notice(owner: string, message: string): void {
    if (message === '' && errorOwner !== owner) return;
    errorOwner = message === '' ? '' : owner;
    element.textContent = message;
  }

  // A clear is never logged, so the owner rule is notice's alone.
  function show(owner: string, message: string): void {
    if (shouldLogError(message, element.textContent ?? '')) bridge.writeLog({ level: 'error', kind: 'error', message });
    notice(owner, message);
  }

  // Failures nobody caught, from either side of the wire, under one owner so they never clear a board's
  // message or have one cleared by them.
  //
  // Main's arrive over the channel, and this is registered at module load rather than in start(), because
  // the launch's own failures are sent the moment the page finishes loading — later than a listener set
  // up here, earlier than anything start() awaits.
  //
  // This side's are the window's, and they cost no shell: a pty lives in main, and a throw inside a
  // listener here is caught by the browser, which logs it and carries on. What it costs is that nobody
  // knows. The board simply does not redraw, or a key does nothing, and the console is the only place it
  // is written down. Now the bar says it.
  bridge.onFailure((message) => show('failure', message));
  // `error` when the thrown value is there, `message` when it is not — a cross-origin script gives the
  // browser nothing to hand over and only the sentence "Script error." to say.
  window.addEventListener('error', (event) => {
    show('failure', failureNotice(event.error ?? event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    show('failure', failureNotice(event.reason));
  });
  return { element, show, notice };
}
