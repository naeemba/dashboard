import { paneIsBusy, programIn, type PaneUse } from './pane-reading';
import { isWorker } from './terminals';

// Whether a project can be closed, and the sentence saying why not. Closing takes every shell and the
// editor away at once and there is no undo for it, so the one thing worth stopping it for is a pane
// with something running in it. Two doors close a project — the close key, in the renderer's
// close-project.ts, and `dashboard project close`, answered in main's project-requests.ts — and both
// ask this, so neither can refuse over something the other's message does not say.

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
// to go and look at a column of them — and each says what was seen running in it, the way a ship's refusal does.
// The project is named with them, because the key is pressed on a list of projects, where the row you
// meant and the row the highlight is on are not always the same one.
//
// Main is never in the way. It is the project's session and runs for as long as the project is open,
// so a close that counted it could never happen; its conversation comes back with the project.
export function closeRefusal(projectName: string, panes: readonly ClosingPane[]): string {
  const running = panes
    .filter((pane) => isWorker(pane.index) && !pane.exited && paneIsBusy(pane))
    .map((pane) => `${pane.name} ${programIn(pane)}`);
  if (running.length === 0) return '';
  return `${projectName} is still running in ${running.join(', ')} — stop it and close again`;
}
