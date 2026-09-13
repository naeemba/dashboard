// Which pane a command from the command screen lands in, and which projects it cannot land in at all.
// That screen marks projects, not panes, so something has to pick one pane per project — and a project
// whose panes are all busy has to be named rather than quietly missed. Kept here rather than in the
// renderer so the picking and the sentence that reports it are one file and cannot word the same run
// two ways.

// What the picking reads off one pane. Two flags rather than a terminal, so this file is testable
// without building one. `busy` is narrower than "an agent has this pane": it is an agent still working,
// or a pane still flagged as asking. Two kinds of pane are free by this reading that you might not mean
// to be. One running `npm run dev`, `tail -f`, psql or vim — the line goes to that program's stdin, and
// only shell integration we do not have could tell that apart from a prompt. And one whose agent asked
// you something you have since looked at: visiting a pane clears its bell, so the flag is gone and
// nothing on screen separates the question from a prompt either.
export type PaneUse = { exited: boolean; busy: boolean };

// `missing` is a project whose folder has gone. Its page is still open and still has a row on the
// command screen, so it reaches the planning and has to leave by a door of its own: it has no panes
// at all, and "no free pane in api" would send you looking for a busy pane that does not exist.
export type ProjectPanes = { name: string; path: string; missing: boolean; panes: readonly PaneUse[] };

// The first pane that can take a command, or -1 when the project has none. First rather than any
// cleverer choice: the panes are in the order they are on screen, so the command lands in the topmost
// free one and you know where to look for it without hunting.
// A dead pane is skipped for the same reason the manager will not answer one — there is no shell
// behind it to read the line — and a busy pane because a line typed at an agent is not a command, it
// is a message to the agent, whether the agent is working or waiting for the answer. What counts as
// busy is decided in PaneUse above, and it is narrower than that sentence sounds.
export function freePaneIndex(panes: readonly PaneUse[]): number {
  return panes.findIndex((pane) => !pane.exited && !pane.busy);
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
