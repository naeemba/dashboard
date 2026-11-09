// What one command did in one project. The state is the whole of what a row draws from, so a row never
// has to read "running" out of a missing exit code — a command that really exits with no code and one
// that has not finished are different things and say so.
export type TaskState = 'idle' | 'running' | 'done' | 'cancelled';

export type TaskResult = {
  projectPath: string;
  state: TaskState;
  // Null until it has finished. A cancelled run has none either: it was killed, not answered.
  exitCode: number | null;
  // What the command last said, already stripped of escape codes. Empty when it said nothing.
  lastLine: string;
  // The last few lines, for the row you have opened. Built by main through the same tailLines the
  // manager's pane rows use, so both screens mean the same thing by "the last few lines".
  tail: string[];
};

// The sequences a command writes to colour a word or move the cursor: the CSI ones every tool uses,
// and the OSC ones that set a terminal title. Stripped rather than drawn, because a row is one line of
// plain text and a raw `\u001B[2K` in the middle of it reads as a bug in this app.
// eslint-disable-next-line no-control-regex -- matching the escape characters is the whole job here
const ESCAPE_SEQUENCE = /\u001B\[[0-9;?]*[A-Za-z]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;

// Raw output as lines a person could read: escape codes gone, and every line resolved to what it
// finally said. A progress bar redraws one line forever with carriage returns, so what survives is
// whatever followed the last one — right for a bar that finished, stale for one that was killed
// mid-sweep. Blank lines are kept here and dropped by whoever is counting, because dropping them this
// early would make "the last five lines" mean different things in different callers.
export function printableLines(output: string): string[] {
  return output
    .replaceAll(ESCAPE_SEQUENCE, '')
    .split('\n')
    // trimEnd, not trim: `npm audit` and a failing test runner say what they mean with indentation, and
    // the tail is shown as a block. A whitespace-only line still collapses to '', which is what
    // lastPrintableLine and tailLines both key off.
    .map((line) => (line.split('\r').at(-1) ?? '').trimEnd());
}

// What the command last said. A tool whose final act is a blank separator has its real message one
// line further up, so blanks are skipped rather than counted.
export function lastPrintableLine(output: string): string {
  return printableLines(output).filter((line) => line !== '').at(-1) ?? '';
}

// What a project's row says to the right of its name. One place, so the row and the status bar cannot
// word the same result two ways.
export function taskSummary(result: TaskResult): string {
  if (result.state === 'idle') return '—';
  if (result.state === 'running') return 'running';
  if (result.state === 'cancelled') return 'cancelled';
  const exit = `exit ${result.exitCode ?? 0}`;
  return result.lastLine === '' ? exit : `${exit} · ${result.lastLine}`;
}

// The selection's key when it is on the command box. Every project path is an absolute filesystem
// path — `/…` on macOS and Linux, `C:\…` on Windows — and none of those spellings is ever the bare
// word here, so it can never collide with one, the way an empty string could if a project's path were
// ever empty.
export const COMMAND_KEY = 'command';

// What the command screen's rows are keyed by, in the order they are drawn: the command box, then one
// project each. The selection is held by key rather than by index, so a project opened or closed
// underneath it keeps the highlight on the row you were looking at.
export function commandKeys(projects: readonly { path: string }[]): string[] {
  return [COMMAND_KEY, ...projects.map((project) => project.path)];
}

// A project nothing has been run in yet. A row draws from a result either way, so there is one shape
// rather than a row that has to know what a missing entry means.
export function idleTask(projectPath: string): TaskResult {
  return { projectPath, state: 'idle', exitCode: null, lastLine: '', tail: [] };
}

// Whether a row has anything to open under it. Enter on a row with nothing falls through to running the
// command, which is what makes "Enter runs it" true from a project row too, rather than a key that
// types as working on some rows and silently does nothing on others.
export function hasTail(result: TaskResult): boolean {
  return result.tail.length > 0;
}

// Whether a run is still going, asked of the results rather than counted as they arrive: a cancel
// answers every project at once, and a tally kept by hand would have to be right about how many of
// those it had already seen.
export function anyRunning(results: Iterable<TaskResult>): boolean {
  for (const result of results) if (result.state === 'running') return true;
  return false;
}

// One command in one project, while it is still running. Generic over the child so this stays a pure
// module: main.ts hands it node's ChildProcess, and a test hands it anything at all.
export type RunningTask<Child> = { child: Child; projectPath: string };

// A process has ended: what is left running, and whether this ending is the one to report. Two guards,
// and each stops a row that would otherwise be wrong.
//
// A run that is not the current one is a process a newer run already killed. Let it report and three
// rows the new run has just marked `running` flip back to `cancelled` in front of you — press Escape
// and immediately Enter to see it — and stay wrong until the next run.
//
// A child no longer in the list has been answered for already. A spawn that fails fires `error` and
// then `close`, and the second would overwrite the first — which is the one carrying the message.
export function finishedTasks<Child>(
  tasks: RunningTask<Child>[], child: Child, run: number, currentRun: number,
): { tasks: RunningTask<Child>[]; send: boolean } {
  if (run !== currentRun || !tasks.some((task) => task.child === child)) return { tasks, send: false };
  return { tasks: tasks.filter((task) => task.child !== child), send: true };
}
