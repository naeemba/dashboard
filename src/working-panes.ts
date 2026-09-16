// Which panes have an agent still working in them, as main sees it. Main holds the ptys, so it knows a
// process is there, which is a different question: a pane runs `exec claude`, and Claude Code sits at
// its prompt when the card is done rather than exiting. Only the screen tells the two apart, and only
// the renderer has the screen — so the renderer reports, and this is what main makes of the reports
// over time.
//
// Over time rather than the last one on its own, because "not in the latest report" has two meanings.
// The pane was looked at and was quiet, or the pane did not exist when the report was built. A report
// arrives on a timer and Claude Code takes a moment more to draw its first spinner, so a pane started
// four seconds ago is the second one — and the one reader is the review sweep, which answers "quiet" by
// removing the pane's folder and killing every shell in it. On the single sample, shipping a card whose
// branch already carries a pull request number has the sweep delete the worktree out from under the
// agent you started eight seconds ago.
//
// So a pane is working until it has been quiet for the floor, and an agent that has just been started
// counts as working from the keystroke. The floor is also what covers an agent that has stopped to ask
// you something: it prints neither busy pattern — that is what the pane's reading of "busy" is for —
// and its bell goes quiet the moment you look at the pane, so it reads idle while it is plainly alive.
// A question you answer inside the floor never reaches the sweep.

// How often the renderer reports, and how often the sweep that reads the reports runs. One number, in
// one place, for both: halve it to make reviews feel quicker and the report follows, rather than main
// acting on an answer a whole sweep and a half old.
export const WORKING_REPORT_MS = 5_000;

// How long a pane goes on counting as working after the last report that named it. Wide enough for a
// missed report and the pane that has not drawn its first spinner yet, and for the seconds you spend
// reading a question before you answer it.
export const WORKING_FLOOR_MS = 30_000;

export type WorkingPanes = {
  // One report, whole: every pane the renderer can currently see an agent working in.
  report: (ids: readonly string[], now: number) => void;
  // An agent has just been started in this pane. True from the keystroke, the way the process itself
  // is, so the window before the first report is not read as quiet.
  started: (id: string, now: number) => void;
  // Whether the pane still counts as working.
  works: (id: string, now: number) => boolean;
};

export function workingPanes(): WorkingPanes {
  // When each pane was last seen working. A pane that is not in here at all has had no agent started in
  // it this run, and the caller has already asked whether one is running before it gets here.
  const lastWorkingAt = new Map<string, number>();
  return {
    report: (ids, now) => { for (const id of ids) lastWorkingAt.set(id, now); },
    started: (id, now) => { lastWorkingAt.set(id, now); },
    works: (id, now) => {
      const seen = lastWorkingAt.get(id);
      return seen !== undefined && now - seen < WORKING_FLOOR_MS;
    },
  };
}
