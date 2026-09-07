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

// The banner is only worth raising when the window is behind something else, and only once per mark.
// Without the second half, a watcher that rings on every failing run leaves a stack of the same
// sentence in Notification Center. The flag is cleared with the mark, so a pane marked while you were
// in the app still gets its banner when it rings again after you have walked away.
export function raisesNotification(windowFocused: boolean, alreadyNotified: boolean): boolean {
  return !windowFocused && !alreadyNotified;
}

// The tab strip only has room for the project name, so the panes are named in the right-hand span
// instead — otherwise arriving at a yellow project tells you nothing about which of its six panes rang.
export function waitingNames(panes: readonly { waiting: boolean; name: string }[]): string[] {
  return panes.filter((pane) => pane.waiting).map((pane) => pane.name);
}
