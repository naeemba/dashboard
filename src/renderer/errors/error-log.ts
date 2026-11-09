import type { LogDraft } from '../../shared/app/log-entry';
import { errorDetail } from '../../shared/app/log-error';
import { isRepeatFailure } from '../../shared/app/log-entry';

// Whether a status-bar message goes in the log: once a minute per sentence. A failure on a timer says
// the same sentence every few seconds, and now that a message goes by itself the bar no longer holds
// it to compare against; logging each repaint would fill the file with one line. A clear is nothing.
export function logsStatusMessage(lastLogged: Map<string, number>, message: string, at: number): boolean {
  return message !== '' && !isRepeatFailure(lastLogged, message, at);
}

// A notice's line: info, under the owner that wrote it, so a refusal seen once is still on record.
export function noticeDraft(owner: string, message: string): LogDraft {
  return { level: 'info', kind: 'app', action: owner, message };
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
export function errorDraft(owner: string, message: string, reads: readonly FailureRead[], now: number): LogDraft {
  const draft: LogDraft = { level: 'error', kind: 'error', action: owner, message };
  const read = reads.findLast((each) => now - each.at <= FAILURE_READ_WINDOW_MS && message.includes(each.text));
  if (read === undefined || typeof read.error !== 'object' || read.error === null) return draft;
  return { ...draft, error: errorDetail(read.error) };
}
