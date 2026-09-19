// Which pane a command from the command screen lands in, and which projects it cannot land in at all.
// That screen marks projects, not panes, so something has to pick one pane per project — and a project
// whose panes are all busy has to be named rather than quietly missed. Kept here rather than in the
// renderer so the picking and the sentence that reports it are one file and cannot word the same run
// two ways.

// What the picking reads off one pane. Two flags rather than a terminal, so this file is testable
// without building one. `busy` is "something is running in this pane", and it is main's answer, not
// the renderer's: it comes over `panes:use` from `paneIsBusy` in ship.ts, which reads the pty's
// foreground process. That is the same reading a ship takes before it takes a pane, and it is the
// whole point — the command screen used to work `busy` out from what the pane had on its screen,
// where a dev server that has printed its banner is indistinguishable from an empty prompt.
export type PaneUse = { exited: boolean; busy: boolean };

// `missing` is a project whose folder has gone. Its page is still open and still has a row on the
// command screen, so it reaches the planning and has to leave by a door of its own: it has no panes
// at all, and "no free pane in api" would send you looking for a busy pane that does not exist.
export type ProjectPanes = { name: string; path: string; missing: boolean; panes: readonly PaneUse[] };

// The first pane that can take a command, or -1 when the project has none. First rather than any
// cleverer choice: the panes are in the order they are on screen, so the command lands in the topmost
// free one and you know where to look for it without hunting.
// A dead pane is skipped for the same reason the manager will not answer one — there is no shell
// behind it to read the line — and a busy pane because the line would land on top of whatever is
// already running there: at an agent, where it is a message rather than a command, or at a dev server,
// where it is a line of text typed into its log.
export function freePaneIndex(panes: readonly PaneUse[]): number {
  return panes.findIndex(paneIsFree);
}

// Whether a pane can take a line of shell. One place says so, because two screens ask opposite halves
// of it: this one picks the free pane, and closing a project refuses over the panes that are neither
// free nor dead. Spelled twice with the sign flipped, a third flag added to PaneUse would reach one of
// them — and a pane the command screen will not type into would be one a close kills without a word.
// Both halves read the same `busy` main sends, so the pane a command lands in, the pane a close will
// take and the pane a ship takes are all decided by one reading of what is running.
export function paneIsFree(pane: PaneUse): boolean {
  return !pane.exited && !pane.busy;
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
    if (paneIndex === -1) skipped.push(project.name);
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
