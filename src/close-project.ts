import { paneIsFree, type PaneUse } from './free-pane';

// Whether a project can be closed, and the sentence saying why not. Closing takes five shells and an
// editor away at once and there is no undo for it, so the one thing worth stopping it for is a pane
// with something running in it. Both halves live here: the key asks this before it closes anything,
// and the status bar prints what comes back, so the refusal and the message cannot come to disagree.

// What this reads off a pane. The same two flags free-pane.ts picks a pane by, and worked out in the
// same place — `paneUse` in pane.ts, which is also where how much of "running" they can actually catch
// is spelled out. It is narrower than the word sounds: a dev server, a tail or vim look exactly like a
// shell sitting at its prompt, and a project whose panes are all doing that closes without a word.
export type ClosingPane = PaneUse & { name: string };

// The refusal, or an empty string when nothing is in the way.
//
// A pane stops the close when it is neither free nor dead. Free is free-pane.ts's word, the one the
// command screen picks a pane by, so a pane it would not type a command into is a pane this will not
// kill without asking. Dead is the other end: a pane that has exited has no shell left to lose, so it
// never holds a project open.
//
// The panes in the way are named rather than counted — three names beat a number that only tells you
// to go and look at five — and the project is named with them, because the key is pressed on a list of
// projects, where the row you meant and the row the highlight is on are not always the same one.
export function closeRefusal(projectName: string, panes: readonly ClosingPane[]): string {
  const running = panes.filter((pane) => !pane.exited && !paneIsFree(pane)).map((pane) => pane.name);
  if (running.length === 0) return '';
  return `${projectName} is still running in ${running.join(', ')} — stop it and close again`;
}
