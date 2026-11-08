import type { LogDraft } from '../../shared/app/log-entry';
import { errorDetail } from '../../shared/app/log-error';

// Whether a status-bar message goes in the log. A failure on a timer says the same sentence every few
// seconds; logging each repaint would fill the file with one line. A clear is not an error at all.
export function shouldLogError(message: string, onScreen: string): boolean {
  return message !== '' && message !== onScreen;
}

// An error failureText read, and when.
export type FailureRead = { error: unknown; text: string; at: number };

// How many reads are kept, and how long one may sit before the bar's message is built from it. Every
// caller reads the error and shows the sentence in the same breath, so a second is generous; a read
// older than that was for something nobody showed (a draft's JSON check) and must not lend its stack
// to a later message that happens to contain the same words.
export const FAILURE_READS_KEPT = 8;
export const FAILURE_READ_WINDOW_MS = 1000;

export function rememberRead(reads: readonly FailureRead[], read: FailureRead): FailureRead[] {
  return [...reads, read].slice(-FAILURE_READS_KEPT);
}

// The line the bar's error writes to main: the sentence, and the Error behind it when one was read
// just now and the sentence is built around it. Newest first, so the read the caller just made wins.
// A thrown string or number has nothing the sentence does not already say, so it adds no detail.
export function errorDraft(message: string, reads: readonly FailureRead[], now: number): LogDraft {
  const draft: LogDraft = { level: 'error', kind: 'error', message };
  const read = [...reads].reverse().find((each) => now - each.at <= FAILURE_READ_WINDOW_MS && message.includes(each.text));
  if (read === undefined || typeof read.error !== 'object' || read.error === null) return draft;
  const detail = errorDetail(read.error);
  return detail === undefined ? draft : { ...draft, error: detail };
}
