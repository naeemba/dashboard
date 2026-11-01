import { homedir } from 'node:os';
import path from 'node:path';
import { NO_USAGE, snapshotOf, usageDiffers, type FileUsage, type UsageSnapshot } from './usage';
import { liveSessions, sweepUsage } from './usage-store';
import type { SessionPlacement } from './resume-ledger';
import { parentProcesses, sessionsByPane } from './pane-sessions';
import { worktreesRoot } from './ship';

// Claude Code's own session logs, read for what each project and each pane has cost. Read-only and
// offline: nothing is asked of any server and nothing under ~/.claude is written. What the numbers mean
// is usage.ts's, the reading is usage-store.ts's, and which pane a session belongs to is
// pane-sessions.ts's — what is here is when the sweep runs and what it does with the answer.
//
// Out of main.ts because that file had reached the 600-line ceiling and this is the job in it that
// belongs to itself: it touches the shells and the open projects and nothing else there, and the three
// modules above already do the thinking. What is left in main is the four things only main can say.
//
// What counts as a change is usageDiffers's and usage.test.ts pins it; what a log adds up to is
// usage-store.ts's; which pane a session is in is pane-sessions.ts's. What is left is two timers, a map,
// and the one branch that lives here — a reading with no process tree is no reading — which
// usage-sweep.test.ts pins.

export type UsageSweepPorts = {
  // The process id of every pane's shell, by terminal id. The one thing that says which pane a Claude
  // Code session is running in, and only main holds the ptys.
  panePids(): ReadonlyMap<number, string>;
  // Every open project, with the folder its worktrees live in — a pane in a worktree is still that
  // project's pane, and its tokens belong on that project's row.
  openProjects(): readonly string[];
  // The process tree, as `ps -eo pid=,ppid=` prints it, or null when `ps` gave no answer — missing,
  // or timed out on a loaded machine. The project figures still stand and only the per-pane ones go
  // missing, which is the smaller half rather than the screen.
  processTree(): Promise<string | null>;
  // Tell the renderer. Called only for a sweep that found different figures.
  publish(usage: UsageSnapshot): void;
  // Where every live session is, by pane, after every sweep whether or not the figures moved. Main keeps
  // it so a restart can resume each pane's conversation; resume-ledger.ts holds the rest. Not called
  // for a sweep that had no process tree.
  placed(placement: SessionPlacement): void;
  // A sweep that threw. Wired to failure.ts's `hold`, which says it now if there is a bar and holds
  // it until there is one, and dedups so a sweep failing every half minute does not repaint the bar
  // every tick. Named for what it is rather than failure.ts's `report`: this cannot box and exit the
  // launch, it only holds.
  sweepFailed(error: unknown): void;
};

const claudeLogs = path.join(homedir(), '.claude', 'projects');
const claudeSessions = path.join(homedir(), '.claude', 'sessions');

// Every half minute, which is the rate the manager's rows already redraw themselves at.
const USAGE_SWEEP_MS = 30_000;
// The first sweep waits: it is the only one that reads every log there has ever been, and a launch has
// five shells and a window to get on screen first.
const FIRST_SWEEP_MS = 3_000;

export type UsageSweep = {
  // What the renderer's first read answers with. Everything after it arrives unasked on usage:change.
  latest(): UsageSnapshot;
  // Sweep from now until the app quits.
  start(): void;
  // The same reading the sweep takes, taken now, or null when there is no process tree to take it
  // from. Quit asks for it so a conversation started, or a /clear typed, in the last half minute is
  // the one saved.
  placeNow(): Promise<SessionPlacement | null>;
};

export function usageSweep(ports: UsageSweepPorts): UsageSweep {
  // Kept across sweeps, which is what makes every sweep after the first one nearly free: a log whose
  // size has not moved is not opened at all.
  const usageFiles = new Map<string, FileUsage>();
  let usage: UsageSnapshot = NO_USAGE;

  // One spelling of "which session is in which pane" for the sweep and for quit, so the two cannot
  // place a session differently. With no tree, every claude started at a prompt has no pane, and
  // "nothing is running anywhere" saved over the last reading would resume nothing next launch.
  async function placeSessions(): Promise<SessionPlacement | null> {
    const takenAt = Date.now();
    const [tree, sessions] = await Promise.all([ports.processTree(), liveSessions(claudeSessions)]);
    if (tree === null) return null;
    return { byPane: sessionsByPane(parentProcesses(tree), ports.panePids(), sessions), takenAt };
  }

  async function run(): Promise<void> {
    const now = Date.now();
    // Two reads that need nothing from each other: the logs, and where each running session is.
    const [, placement] = await Promise.all([sweepUsage(claudeLogs, usageFiles, now), placeSessions()]);
    if (placement !== null) ports.placed(placement);
    const open = ports.openProjects().map((projectPath) => ({
      path: projectPath, worktrees: worktreesRoot(projectPath),
    }));
    const next = snapshotOf(
      usageFiles.values(),
      open,
      new Map([...(placement?.byPane ?? [])].map(([pane, live]) => [pane, live.session])),
      now,
    );
    // Nothing crosses for a sweep that found the same figures. Whether that is worth a message is
    // usageDiffers's to say.
    const changed = usageDiffers(usage, next);
    usage = next;
    if (changed) ports.publish(usage);
  }

  // Chained rather than on an interval, so a sweep that takes longer than the gap — a first read of
  // half a gigabyte on a slow disk — cannot have the next one start on top of it.
  function sweepLater(delay: number): void {
    // The catch is not optional: without it a sweep that threw would be an unhandled rejection rather
    // than a caught one, which is a crash in the main process, not a frozen figure for half a minute.
    // What it buys beyond safety is that the error reaches ports.sweepFailed and gets a name on the bar,
    // instead of the bare "Something broke" the process-wide handler would print.
    setTimeout(() => {
      void run().catch(ports.sweepFailed).finally(() => sweepLater(USAGE_SWEEP_MS));
    }, delay).unref();
  }

  return { latest: () => usage, start: () => sweepLater(FIRST_SWEEP_MS), placeNow: placeSessions };
}
