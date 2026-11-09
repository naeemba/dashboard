import type { DashboardBridge } from '../../shared/app/bridge';
import type { Settings } from '../../shared/settings/settings';
import { errorDraft, logsStatusMessage, noticeDraft, rememberRead, type FailureRead } from './error-log';
import { messageLifetime, raisesErrorBanner, type StatusKind } from './status-message';
import { failureNotice, whenFailureRead } from '../../shared/errors/failure';
import { isModified } from '../keys/shortcuts';

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
// A failure goes through show and logs an error line; everything else the bar says — a hint, a
// refusal, progress like `shipping "Fix login"…` — goes through notice and logs an info line, so a
// refusal seen once is still on record without reading as a failure. Each sentence at most once a
// minute. An owner that clears its message still may, but nobody has to: every message goes by itself
// (status-message.ts), sooner on a click or a bare Escape. The Escape is watched, never taken: the
// pane or dialog it was meant for still gets it (errors-decision-5).
//
// An error while the window is away raises a desktop banner too, unless settings errors.notify is off.
export function createStatusError(bridge: DashboardBridge, settings: () => Settings): StatusError {
  const element = document.createElement('span');
  element.className = 'error';
  let errorOwner = '';
  let fade: ReturnType<typeof setTimeout> | undefined;
  const logged = new Map<string, number>();
  const raised = new Map<string, number>();
  // The errors failureText read lately, so the bar's log line carries the stack of the one its sentence
  // was built from (errors-decision-4).
  let reads: FailureRead[] = [];
  whenFailureRead((error, text) => { reads = rememberRead(reads, { error, text, at: Date.now() }); });

  function draw(owner: string, message: string, kind: StatusKind): void {
    if (message === '' && errorOwner !== owner) return;
    errorOwner = message === '' ? '' : owner;
    element.textContent = message;
    clearTimeout(fade);
    if (message !== '') fade = setTimeout(dismiss, messageLifetime(kind, message));
  }

  function dismiss(): void {
    draw(errorOwner, '', 'notice');
  }

  // A clear is never logged, so the owner rule is draw's alone.
  function notice(owner: string, message: string): void {
    if (logsStatusMessage(logged, message, Date.now())) bridge.writeLog(noticeDraft(owner, message));
    draw(owner, message, 'notice');
  }

  function show(owner: string, message: string): void {
    const now = Date.now();
    if (logsStatusMessage(logged, message, now)) bridge.writeLog(errorDraft(owner, message, reads, now));
    if (raisesErrorBanner(raised, message, now, document.hasFocus(), settings().errors.notify)) {
      bridge.notify('Dashboard', message);
    }
    draw(owner, message, 'error');
  }

  element.addEventListener('click', dismiss);
  // Capture, so a dialog that stops the key still lets the bar see it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !isModified(event)) dismiss();
  }, true);

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
