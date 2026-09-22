// What happens to a failure nothing else caught.
//
// Node ends the process on an uncaught exception, and since v15 on an unhandled rejection too. For most
// programs that is the right answer: nobody knows what state is left, so stop. Here it is the worst
// outcome there is. Every pane is a shell that exists only inside this window — a test run, a deploy, an
// agent halfway through a card — and none of it comes back. Closing the window on purpose asks first,
// and CLAUDE.md calls Force Quit the one exit that takes the shells without asking. A stray rejection
// from a five-second timer must not be a second one.
//
// So a failure that reaches here is said on the status bar and the app carries on. Something is broken,
// and the message names it; the panes are not.
//
// One exception, and it is the launch. Before a window has ever opened there is nothing to carry on
// with — no shell exists, no project is open, nothing is in flight — and nowhere to print. A box then,
// and exit, which is what docs/decisions.md already settled for an unreadable worktree record.
//
// This is not the answer for a failure somebody did catch. A caught one is caught where the cost is
// known, so the launch can decide to go on without that part: a .env that will not load costs the
// settings in it and nothing else. A failure that reaches here says nothing about what still works.

// How an error of any shape reads. Anything can be thrown, and a rejection carries whatever it was
// rejected with, so `error.message` is not a field to count on.
export function failureText(error: unknown): string {
  // An Error with nothing in its message still has a name, and `TypeError` on its own is worth
  // printing. The bare `Error` is not, so that one falls through to the line below.
  if (error instanceof Error) {
    if (error.message !== '') return error.message;
    return error.name !== '' && error.name !== 'Error' ? error.name : 'no reason given';
  }
  // `String(undefined)` is "undefined", which on the status bar reads as a bug in the message rather
  // than in the app. Say that nothing was given instead.
  if (error === undefined || error === null) return 'no reason given';
  const text = typeof error === 'string' ? error : String(error);
  return text.trim() === '' ? 'no reason given' : text;
}

// What the status bar says. One spelling, because both sides of the wire have these failures — main's
// uncaught exceptions and the renderer's own — and two sentences saying the same thing would drift.
export function failureNotice(error: unknown): string {
  return `Something broke: ${failureText(error)} — the app is still running, part of it may not be.`;
}

// How long the same message stays deduplicated on the bar before it is allowed to say itself again,
// even with nothing else having taken the bar in between.
const DEDUP_WINDOW_MS = 60_000;

export type FailureResponse =
  // Said on the status bar, and every shell keeps running.
  | { keepRunning: true; message: string }
  // A box, then exit. The two fields are the two showErrorBox takes.
  | { keepRunning: false; title: string; detail: string };

// `windowHasOpened`, not "there is a window right now". Once one has opened, a window that has since
// gone means the app is quitting or has quit, and a box asking about it then is a second question over
// a decision already made.
export function respondToFailure(error: unknown, windowHasOpened: boolean): FailureResponse {
  if (windowHasOpened) return { keepRunning: true, message: failureNotice(error) };
  return {
    keepRunning: false,
    title: 'Dashboard could not start',
    // True, and worth saying: the shells are spawned with the window, so a launch that stops here has
    // taken nothing with it. Open it again.
    detail: `${failureText(error)}\n\nNothing was open yet, so nothing was lost.`,
  };
}

export type FailureReporterPorts = {
  // Put the message on the status bar. False when there is no window drawn to take it — which is the
  // whole of the launch, and why anything said then has to wait.
  say(message: string): boolean;
  // A box and an exit. Only ever called before a window has opened.
  stop(title: string, detail: string): void;
};

export type FailureReporter = {
  // A failure from anywhere in the main process, caught or not.
  report(error: unknown): void;
  // Something caught, with a known cost, said now if there is a bar to say it on and held until there
  // is one otherwise. Not only the launch any more — a background sweep on a timer for the life of the
  // app calls this on every failing tick, so this has to reach the bar the same way `report` does.
  hold(message: string): void;
  // A window has finished loading. What is held goes out now.
  drain(): void;
  // Called once the window exists, and never unset — respondToFailure says why.
  windowOpened(): void;
};

export function failureReporter(ports: FailureReporterPorts): FailureReporter {
  // One message, not a list of them. The bar is a single line, so a second one sent in the same breath
  // paints over the first before anybody reads it — holding several would only be a slower way of
  // showing the last.
  let waiting: string | undefined;
  let lastSaid: string | undefined;
  let lastSaidAt = 0;
  let windowHasOpened = false;

  // The same sentence twice running is said once. Some of what reports here is on a timer, and a thing
  // that is broken is broken on every tick: without this, a folder gone read-only repaints the bar every
  // five seconds, so `Board not saved: EACCES` — the line telling you your card is not on disk — is
  // wiped out before you have read it and never comes back.
  //
  // Only while it is both the last thing said AND recent. The bar is owner-scoped in the renderer, so
  // another owner can clear or overwrite it without this module hearing about it — a fixed permission
  // clears `Board not saved` on the next good save, but a still-broken sweep would otherwise never say
  // itself again because the message still equals lastSaid. Expiring the memory after a minute bounds
  // how long a repeating failure can stay silent, without giving back the five-second repaint the dedup
  // exists to stop.
  function say(message: string): boolean {
    const now = Date.now();
    if (message === lastSaid && now - lastSaidAt < DEDUP_WINDOW_MS) return true;
    if (!ports.say(message)) return false;
    lastSaid = message;
    lastSaidAt = now;
    return true;
  }

  function report(error: unknown): void {
    const response = respondToFailure(error, windowHasOpened);
    // Every time, undeduplicated: the terminal the app was started from is where a developer finds the
    // stack, and there the repeats are the evidence.
    console.error(error);
    if (!response.keepRunning) return ports.stop(response.title, response.detail);
    if (!say(response.message)) waiting = response.message;
  }

  return {
    report,
    hold: (message) => { if (!say(message)) waiting = message; },
    drain: () => {
      if (waiting !== undefined) say(waiting);
      waiting = undefined;
    },
    windowOpened: () => { windowHasOpened = true; },
  };
}
