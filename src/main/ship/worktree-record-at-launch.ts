import { app, dialog } from 'electron';
import { existsSync } from 'node:fs';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { failureText } from '../../shared/errors/failure';
import { livingEntries, panesAtLaunch, readWorktrees, writeWorktrees } from './worktree-store';

// The worktree record as a launch starts it, read once before anything else in main needs it.
//
// Dropped on read, so a worktree removed by hand outside the app does not leave its card marked as in
// flight forever with nothing able to clear it.
//
// Every pane comes back null with it. A shell the pane host kept is put back in its pane when its
// project opens, and adoptSurvivors names it on its card again; any other pane is a plain shell in
// the project a moment after launch, and a record
// still naming it would put a branch name under the status bar of a checkout the pane is not in —
// which is the wrong-checkout mistake the branch is printed there to prevent. A card's agent that a
// restart resumes is in that pane again, and resumeIn names it on the record again. Clearing it also gives
// the worktree back: a card with no pane is the one ship that is allowed to run again, and shipping
// it hands the folder that is already there to a pane. Written out, so the file says what this says.
//
// `panes` is the pane each card's agent was in when the app last ran, kept from before the clearing so a
// restart resumes the agent in that pane and nowhere else. agentToResume holds why.
//
// The read throws rather than answering an unreadable file with an empty list, and readWorktrees says
// why. Nothing after it could carry on without the list, so the launch stops here: a box naming the file,
// then exit. showErrorBox is the only dialog there is before the app is ready — every other one wants
// a window, and there is not going to be one — and the message is all anyone gets, so it names the
// file. exit rather than quit, because quit runs the ordinary shutdown over a main process that is
// half built and has nothing to shut down yet.
export function worktreeRecordAtLaunch(file: string): { entries: WorktreeEntry[]; panes: Map<string, number> } {
  let atLaunch: { entries: WorktreeEntry[]; panes: Map<string, number> } = { entries: [], panes: new Map() };
  try {
    atLaunch = panesAtLaunch(livingEntries(readWorktrees(file), existsSync));
  } catch (error: unknown) {
    dialog.showErrorBox(
      'Dashboard cannot read its worktree record',
      `${file}\n\n${failureText(error)}\n\nNothing has been changed. Open Dashboard again once that file can be read.`,
    );
    app.exit(1);
  }
  // Outside the try: a failed write is worktree-store's to swallow, and inside it would read as a write
  // that can stop the launch.
  writeWorktrees(file, atLaunch.entries);
  return atLaunch;
}
