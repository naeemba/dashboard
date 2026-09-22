import { homedir } from 'node:os';
import path from 'node:path';
import { NO_USAGE, snapshotOf, usageDiffers, type FileUsage, type UsageSnapshot } from './usage';
import { liveSessions, sweepUsage } from './usage-store';
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
// No test file, and that is the exemption CLAUDE.md gives main's wiring, which travels with the code
// rather than the filename — the same one task-runner.ts sits under. Nothing is decided here. What
// counts as a change is usageDiffers's and usage.test.ts pins it; what a log adds up to is
// usage-store.ts's; which pane a session is in is pane-sessions.ts's. What is left is two timers and a
// map, and a test of those is a test of mocks. A branch that moves in here owes a test wherever it
// sits.

export type UsageSweepPorts = {
  // The process id of every pane's shell, by terminal id. The one thing that says which pane a Claude
  // Code session is running in, and only main holds the ptys.
  panePids(): ReadonlyMap<number, string>;
  // Every open project, with the folder its worktrees live in — a pane in a worktree is still that
  // project's pane, and its tokens belong on that project's row.
  openProjects(): readonly string[];
  // The process tree, as `ps -eo pid=,ppid=` prints it. Empty on a machine that has no `ps`: the
  // project figures still stand and only the per-pane ones go missing, which is the smaller half
  // rather than the screen.
  processTree(): Promise<string>;
  // Tell the renderer. Called only for a sweep that found different figures.
  publish(usage: UsageSnapshot): void;
  // A sweep that threw. Said out loud rather than swallowed: the numbers simply stop moving otherwise,
  // and the manager's row goes on showing what a project had spent half an hour ago as if that were
  // current. failure.ts says the same sentence only once, so a sweep failing every half minute does not
  // hold the bar.
  report(error: unknown): void;
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
};

export function usageSweep(ports: UsageSweepPorts): UsageSweep {
  // Kept across sweeps, which is what makes every sweep after the first one nearly free: a log whose
  // size has not moved is not opened at all.
  const usageFiles = new Map<string, FileUsage>();
  let usage: UsageSnapshot = NO_USAGE;

  async function run(): Promise<void> {
    const now = Date.now();
    // Three reads that need nothing from each other: the logs, the process tree, and the sessions
    // Claude Code has running.
    const [, tree, sessions] = await Promise.all([
      sweepUsage(claudeLogs, usageFiles, now),
      ports.processTree(),
      liveSessions(claudeSessions),
    ]);
    const open = ports.openProjects().map((projectPath) => ({
      path: projectPath, worktrees: worktreesRoot(projectPath),
    }));
    const next = snapshotOf(
      usageFiles.values(),
      open,
      sessionsByPane(parentProcesses(tree), ports.panePids(), sessions),
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
    // The catch is not optional: `finally` re-throws what it was handed, and one sweep that threw would
    // otherwise end the chain, so the figures would freeze for the rest of the run rather than for one
    // half minute.
    setTimeout(() => {
      void run().catch(ports.report).finally(() => sweepLater(USAGE_SWEEP_MS));
    }, delay).unref();
  }

  return { latest: () => usage, start: () => sweepLater(FIRST_SWEEP_MS) };
}
