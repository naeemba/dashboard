import { isRecord } from './is-record';

// An error as a log entry carries it: what a person needs to find where it came from, once the Error
// itself is gone. Shared, because the renderer builds one from its own errors and main reads every
// entry back through readLogError, whichever side wrote it.
export type LogError = { name?: string; message: string; stack?: string; code?: string; cause?: LogError };

// A stack past this is cut. Twenty-odd frames say where it came from; the rest is the framework's,
// and at this size a file of LOG_FILE_LIMIT still holds a couple of thousand failures.
export const STACK_LIMIT = 2000;
const MESSAGE_LIMIT = 1000;
// A cause of a cause of a cause is still worth reading; a chain deeper than this is a loop or a library
// wrapping itself, and an error whose cause is itself would never stop.
const CAUSE_DEPTH = 4;

export function cutToSize(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function codeOf(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function readAt(value: unknown, depth: number): LogError | undefined {
  if (!isRecord(value) && !(value instanceof Error)) {
    if (value === undefined || value === null) return undefined;
    return { message: cutToSize(String(value), MESSAGE_LIMIT) };
  }
  // An Error's name, message and stack are its own or its prototype's, never enumerable, so they are
  // read by name rather than spread.
  const { name, message, stack, code, cause } = value as Record<string, unknown>;
  const detail: LogError = { message: typeof message === 'string' ? cutToSize(message, MESSAGE_LIMIT) : '' };
  if (typeof name === 'string' && name !== '') detail.name = name;
  if (typeof stack === 'string' && stack !== '') detail.stack = cutToSize(stack, STACK_LIMIT);
  const readCode = codeOf(code);
  if (readCode !== undefined) detail.code = readCode;
  if (depth < CAUSE_DEPTH) {
    const readCause = readAt(cause, depth + 1);
    if (readCause !== undefined) detail.cause = readCause;
  }
  return detail;
}

// Anything thrown, as the log keeps it. Also how an entry is read back off disk or off the wire: the
// same cuts apply to a stack another screen sent as to one built here.
export function errorDetail(error: unknown): LogError | undefined {
  return readAt(error, 0);
}
