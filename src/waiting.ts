// What a bell means. Three questions with three answers, kept here rather than inline in the handler
// so they can be tested: does this bell mark the pane, does it raise a banner, and which panes on a
// page are currently asking for you. `renderer.ts` reads the browser for the two flags and wires the
// answers to the screen.

// A bell from the pane you are looking at is not news — you are already there, and a shell rings it
// for ordinary things like an ambiguous tab-completion. Every other pane is marked, including every
// pane on the board, where nothing holds the keyboard at all.
export function marksWaiting(windowFocused: boolean, isFocusedPane: boolean): boolean {
  return !windowFocused || !isFocusedPane;
}

// A pane is in one of three states, not two independent flags: it is quiet, or it is asking, or it is
// asking and has already had its banner. One field, because 'notified but not asking' is not a state a
// pane can be in — and arriving at the pane puts it back to 'quiet' in a single write, so there is no
// pair of flags anyone has to remember to clear together.
export type Bell = 'quiet' | 'waiting' | 'notified';

// The banner is only worth raising when the window is behind something else, and only once per mark.
// Without the second half, a watcher that rings on every failing run leaves a stack of the same
// sentence in Notification Center. A pane marked while you were in the app is still only 'waiting', so
// it does get its banner when it rings again after you have walked away.
export function raisesNotification(windowFocused: boolean, bell: Bell): boolean {
  return !windowFocused && bell !== 'notified';
}

// Whether a pane is asking for you at all, which both states other than 'quiet' mean: 'notified' is
// 'waiting' that has already had its banner. One place says so, so the tab strip going yellow and the
// manager listing the pane can never disagree about which panes are asking.
export function isRinging(bell: Bell): boolean {
  return bell !== 'quiet';
}

// The tab strip only has room for the project name, so the panes are named in the right-hand span
// instead — otherwise arriving at a yellow project tells you nothing about which of its six panes rang.
export function waitingNames(panes: readonly { bell: Bell; name: string }[]): string[] {
  return panes.filter((pane) => isRinging(pane.bell)).map((pane) => pane.name);
}
