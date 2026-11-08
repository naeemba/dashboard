import { describe, expect, it } from 'vitest';
import {
  errorDraft, FAILURE_READ_WINDOW_MS, FAILURE_READS_KEPT, rememberRead, shouldLogError, type FailureRead,
} from './error-log';

describe('shouldLogError', () => {
  it('logs a new message', () => {
    expect(shouldLogError('Board not saved: EACCES', '')).toBe(true);
    expect(shouldLogError('Board not saved: EACCES', 'Notes not saved: EIO')).toBe(true);
  });
  it('does not log the message already on the bar, or a clear', () => {
    expect(shouldLogError('Board not saved: EACCES', 'Board not saved: EACCES')).toBe(false);
    expect(shouldLogError('', 'Board not saved: EACCES')).toBe(false);
  });
});

describe('errorDraft', () => {
  const thrown = new Error('EACCES');
  const read = (error: unknown, text: string, at: number) => ({ error, text, at });

  it('sends the stack of the error the sentence was built from', () => {
    const draft = errorDraft('Board not saved: EACCES', [read(thrown, 'EACCES', 1000)], 1000);
    expect(draft).toEqual({
      level: 'error', kind: 'error', message: 'Board not saved: EACCES',
      error: { name: 'Error', message: 'EACCES', stack: thrown.stack },
    });
  });
  it('takes the newest matching read', () => {
    const older = new Error('EACCES');
    expect(errorDraft('Board not saved: EACCES', [read(older, 'EACCES', 900), read(thrown, 'EACCES', 950)], 1000).error?.stack)
      .toBe(thrown.stack);
  });
  it('sends the sentence alone for a stale read, a read the sentence does not contain, or a thrown string', () => {
    const plain = { level: 'error', kind: 'error', message: 'Board not saved: EACCES' };
    expect(errorDraft('Board not saved: EACCES', [read(thrown, 'EACCES', 0)], FAILURE_READ_WINDOW_MS + 1)).toEqual(plain);
    expect(errorDraft('Board not saved: EACCES', [read(thrown, 'EIO', 1000)], 1000)).toEqual(plain);
    expect(errorDraft('Board not saved: EACCES', [read('EACCES', 'EACCES', 1000)], 1000)).toEqual(plain);
  });
});

describe('rememberRead', () => {
  it('keeps only the newest few', () => {
    let reads: FailureRead[] = [];
    for (let at = 0; at < FAILURE_READS_KEPT + 3; at++) reads = rememberRead(reads, { error: undefined, text: '', at });
    expect(reads.map((each) => each.at)).toEqual(Array.from({ length: FAILURE_READS_KEPT }, (_, index) => index + 3));
  });
});
