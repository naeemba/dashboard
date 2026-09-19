import { freePane, paneIsBusy, type PaneUse } from './pane-reading';

// Which pane a command from the command screen lands in, and which projects it cannot land in at all.
// That screen marks projects, not panes, so something has to pick one pane per project — and a project
// whose panes are all busy has to be named rather than quietly missed. Kept here rather than in the
// renderer so the picking and the sentence that reports it are one file and cannot word the same run
// two ways.

// `missing` is a project whose folder has gone. Its page is still open and still has a row on the
// command screen, so it reaches the planning and has to leave by a door of its own: it has no panes
// at all, and "no free pane in api" would send you looking for a busy pane that does not exist.
export type ProjectPanes = { name: string; path: string; missing: boolean; panes: readonly PaneUse[] };

// Whether a pane can take a line of shell, which is what this screen picks by. shipCanTake in
// pane-reading.ts is the ship's answer to the same question, and this is where the two part: a dead
// pane is skipped here for the same reason the manager will not answer one — there is no shell behind
// it to read the line — while a ship takes one gladly, since it spawns a shell in whatever pane it
// takes. Everything else about the two answers is paneIsBusy, spelled once next door.
export function paneIsFree(pane: PaneUse): boolean {
  return !pane.exited && !paneIsBusy(pane);
}

// The pane a command lands in, or null when the project has none going. The order is freePane's, the
// same one a ship takes a pane in: lowest-numbered, except that a pane still standing in a card's
// worktree goes last. So a pane a ship steps around is one this steps around too, and a line you send
// to every project does not land in a finished card's checkout while four empty prompts sit below it.
export function freePaneIndex(panes: readonly PaneUse[]): number | null {
  return freePane(panes, paneIsFree);
}

export type SendPlan = {
  // One per project the command is going to, in the order the screen lists them.
  sends: readonly { path: string; paneIndex: number }[];
  // The names of the projects whose panes were all taken.
  skipped: readonly string[];
  // The names of the projects whose folder is no longer there.
  gone: readonly string[];
};

export function planSend(projects: readonly ProjectPanes[]): SendPlan {
  const sends: { path: string; paneIndex: number }[] = [];
  const skipped: string[] = [];
  const gone: string[] = [];
  for (const project of projects) {
    if (project.missing) {
      gone.push(project.name);
      continue;
    }
    const paneIndex = freePaneIndex(project.panes);
    if (paneIndex === null) skipped.push(project.name);
    else sends.push({ path: project.path, paneIndex });
  }
  return { sends, skipped, gone };
}

// What the status bar says a run did. The projects it missed are named rather than counted: "2
// skipped" only tells you to go looking, and there are a handful of projects open, not a hundred.
// Without this line a project that was marked and got nothing looks exactly like one that ran and
// printed nothing. Two reasons for missing one, kept apart, because they send you to different places:
// a busy project wants you to go and look at its panes, a gone one wants you to reopen the folder.
export function sendSummary(plan: SendPlan): string {
  const parts: string[] = [];
  if (plan.sends.length > 0) {
    parts.push(`sent to ${plan.sends.length} ${plan.sends.length === 1 ? 'pane' : 'panes'}`);
  }
  if (plan.skipped.length > 0) parts.push(`no free pane in ${plan.skipped.join(', ')}`);
  if (plan.gone.length > 0) {
    parts.push(`${plan.gone.join(', ')} ${plan.gone.length === 1 ? 'is' : 'are'} gone`);
  }
  return parts.join(' · ');
}
