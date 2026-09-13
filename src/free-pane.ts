// Which pane a command from the command screen lands in, and which projects it cannot land in at all.
// That screen marks projects, not panes, so something has to pick one pane per project — and a project
// whose panes are all busy has to be named rather than quietly missed. Kept here rather than in the
// renderer so the picking and the sentence that reports it are one file and cannot word the same run
// two ways.

// What the picking reads off one pane. Two flags rather than a terminal, so this file is testable
// without building one. `busy` is looksBusy over the pane's screen — the same question the bell asks
// before it believes a ring, so a pane the manager calls busy and a pane this refuses are the same
// panes.
export type PaneUse = { exited: boolean; busy: boolean };

export type ProjectPanes = { name: string; path: string; panes: readonly PaneUse[] };

// The first pane that can take a command, or -1 when the project has none. First rather than any
// cleverer choice: the panes are in the order they are on screen, so the command lands in the topmost
// free one and you know where to look for it without hunting.
// A dead pane is skipped for the same reason the manager will not answer one — there is no shell
// behind it to read the line — and a busy pane because a line typed into an agent mid-answer is not a
// command, it is a message to the agent.
export function freePaneIndex(panes: readonly PaneUse[]): number {
  return panes.findIndex((pane) => !pane.exited && !pane.busy);
}

export type SendPlan = {
  // One per project the command is going to, in the order the screen lists them.
  sends: readonly { path: string; pane: number }[];
  // The names of the projects it is not going to.
  skipped: readonly string[];
};

export function planSend(projects: readonly ProjectPanes[]): SendPlan {
  const sends: { path: string; pane: number }[] = [];
  const skipped: string[] = [];
  for (const project of projects) {
    const pane = freePaneIndex(project.panes);
    if (pane === -1) skipped.push(project.name);
    else sends.push({ path: project.path, pane });
  }
  return { sends, skipped };
}

// What the status bar says a run did. The skipped projects are named rather than counted: "2 skipped"
// only tells you to go looking, and there are a handful of projects open, not a hundred. Without this
// line a project that was marked and got nothing looks exactly like one that ran and printed nothing.
export function sendSummary(plan: SendPlan): string {
  const missed = `no free pane in ${plan.skipped.join(', ')}`;
  if (plan.sends.length === 0) return plan.skipped.length === 0 ? 'nothing marked' : missed;
  const sent = `sent to ${plan.sends.length} ${plan.sends.length === 1 ? 'pane' : 'panes'}`;
  return plan.skipped.length === 0 ? sent : `${sent} · ${missed}`;
}
