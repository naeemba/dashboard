import type { LogError } from '../../shared/app/log-error';
import type { LogEntry } from '../../shared/app/log-entry';

// What the log section's popup and its copy key make of one entry. The popup is the drawer's JSON
// viewer, so this only decides the value it is handed; the copy is the entry exactly as it was read.

// An error as the popup shows it: its stack one frame to a line, so it reads down the sheet rather
// than as one string of `\n`s, and its cause the same way.
type ShownError = Omit<LogError, 'stack' | 'cause'> & { stack?: string[]; cause?: ShownError };

// One line per frame, each without the indent V8 puts before `at`, blank lines dropped.
export function stackLines(stack: string): string[] {
  return stack.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

function shownError(error: LogError): ShownError {
  const { stack, cause, ...rest } = error;
  return {
    ...rest,
    ...(stack === undefined ? {} : { stack: stackLines(stack) }),
    ...(cause === undefined ? {} : { cause: shownError(cause) }),
  };
}

// The entry for the popup: the row's own fields first, in the order the row reads them, then
// everything else. An older entry has only those first five and shows only those.
export function shownEntry(entry: LogEntry): Record<string, unknown> {
  const { time, level, kind, project, message, error, ...rest } = entry;
  return {
    time, level, kind, project, message,
    ...(error === undefined ? {} : { error: shownError(error) }),
    ...rest,
  };
}

// What the copy button and key put on the clipboard: the whole entry as JSON, two-space indented.
export function copiedEntry(entry: LogEntry): string {
  return JSON.stringify(entry, null, 2);
}
