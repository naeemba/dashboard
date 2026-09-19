import { paneIsBusy, programIn, type PaneUse } from './pane-reading';

// Whether a project can be closed, and the sentence saying why not. Closing takes five shells and an
// editor away at once and there is no undo for it, so the one thing worth stopping it for is a pane
// with something running in it. Both halves live here: the key asks this before it closes anything,
// and the status bar prints what comes back, so the refusal and the message cannot come to disagree.

// What this reads off a pane, which is pane-reading.ts's reading with the pane's name on it. A dev
// server, a tail or vim in a pane holds the project open, the same way it holds a pane back from a
// ship. What it cannot see is a job you put in the background — runsAProgram in pane-reading.ts
// says why.
export type ClosingPane = PaneUse & { name: string };

// The refusal, or an empty string when nothing is in the way.
//
// A pane stops the close when something is running in it and its shell is still there to lose. That is
// paneIsBusy, the same reading the command screen picks a free pane by and a ship takes one by, so a
// pane this app would not type a command into is a pane this will not kill without asking.
//
// The panes in the way are named rather than counted — three names beat a number that only tells you
// to go and look at five — and each says what was seen running in it, the way a ship's refusal does.
// The project is named with them, because the key is pressed on a list of projects, where the row you
// meant and the row the highlight is on are not always the same one.
export function closeRefusal(projectName: string, panes: readonly ClosingPane[]): string {
  const running = panes
    .filter((pane) => !pane.exited && paneIsBusy(pane))
    .map((pane) => `${pane.name} ${programIn(pane)}`);
  if (running.length === 0) return '';
  return `${projectName} is still running in ${running.join(', ')} — stop it and close again`;
}

// The readings main answers with, paired with the names the page has for its panes. The two lists do
// not have to be the same length, so the shorter one drives: main answers with one reading per
// terminal and the page names its editor as well, and a page whose folder has gone has no panes and
// no editor at all.
//
// What the shorter list being the names costs, if this pairs off the readings instead: press Ctrl+Q on
// a page reading `Directory not found: /work/api` and the pairing reaches for a name that is not
// there. The promise nobody awaits rejects, and the close stops before the dialog — no refusal in the
// status bar, no question, no page removed. That key is the only way to take a dead page off the tab
// strip.
export function closingPanes(
  uses: readonly PaneUse[],
  names: readonly { name: string }[],
): ClosingPane[] {
  return uses.slice(0, names.length).map((use, index) => ({ ...use, name: names[index].name }));
}
