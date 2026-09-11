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
    .map((line) => (line.split('\r').at(-1) ?? '').trim());
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
