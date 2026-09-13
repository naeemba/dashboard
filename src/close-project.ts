import type { PaneUse } from './free-pane';

// Whether a project can be closed, and the sentence saying why not. Closing takes five shells and an
// editor away at once and there is no undo for it, so the one thing worth stopping it for is a pane
// with something running in it. Both halves live here: the key asks this before it closes anything,
// and the status bar prints what comes back, so the refusal and the message cannot come to disagree.

// What this reads off a pane. The same two flags free-pane.ts picks a pane by, and worked out in the
// same place — `paneUse` in pane.ts, which is also where how much of "running" they can actually catch
// is spelled out. It is narrower than the word sounds: a dev server, a tail or vim look exactly like a
// shell sitting at its prompt, and a project whose panes are all doing that closes without a word.
export type ClosingPane = PaneUse & { name: string };

// The panes standing in the way, named rather than counted: three panes and a number tells you to go
// and look at five. A pane that has exited is not running anything — its shell is gone and Enter is
// what would start it again — so it never holds a project open.
export function runningPanes(panes: readonly ClosingPane[]): string[] {
  return panes.filter((pane) => !pane.exited && pane.busy).map((pane) => pane.name);
}

// The refusal, or an empty string when there is nothing in the way. The panes are named so you know
// where to go, and the project is named because the key is pressed on a list of projects, where the
// row you meant and the row the highlight is on are not always the same one.
export function closeRefusal(projectName: string, panes: readonly ClosingPane[]): string {
  const running = runningPanes(panes);
  if (running.length === 0) return '';
  return `${projectName} is still running in ${running.join(', ')} — stop it and close again`;
}
