import { describe, expect, it } from 'vitest';
import {
  errorDraft, FAILURE_READ_WINDOW_MS, FAILURE_READS_KEPT, logsStatusMessage, noticeDraft, rememberRead, type FailureRead,
} from './error-log';
import { FAILURE_REPEAT_WINDOW_MS } from '../../shared/app/log-entry';

describe('logsStatusMessage', () => {
  it('logs a sentence once, again only after a quiet minute, and never a clear', () => {
    const logged = new Map<string, number>();
    expect(logsStatusMessage(logged, 'Board not saved: EACCES', 0)).toBe(true);
    expect(logsStatusMessage(logged, 'Notes not saved: EIO', 1000)).toBe(true);
    expect(logsStatusMessage(logged, 'Board not saved: EACCES', 5000)).toBe(false);
    expect(logsStatusMessage(logged, 'Board not saved: EACCES', FAILURE_REPEAT_WINDOW_MS + 5000)).toBe(true);
    expect(logsStatusMessage(logged, '', 0)).toBe(false);
  });
});

describe('noticeDraft', () => {
  it('logs a notice as info under its owner', () => {
    expect(noticeDraft('chat', 'Fix login has no conversation to show'))
      .toEqual({ level: 'info', kind: 'app', action: 'chat', message: 'Fix login has no conversation to show' });
  });
});

describe('errorDraft', () => {
  const thrown = new Error('EACCES');
  const read = (error: unknown, text: string, at: number) => ({ error, text, at });

  it('sends the stack of the error the sentence was built from', () => {
    const draft = errorDraft('board', 'Board not saved: EACCES', [read(thrown, 'EACCES', 1000)], 1000);
    expect(draft).toEqual({
      level: 'error', kind: 'error', action: 'board', message: 'Board not saved: EACCES',
      error: { name: 'Error', message: 'EACCES', stack: thrown.stack },
    });
  });
  it('takes the newest matching read', () => {
    const older = new Error('EACCES');
    expect(errorDraft('board', 'Board not saved: EACCES', [read(older, 'EACCES', 900), read(thrown, 'EACCES', 950)], 1000).error?.stack)
      .toBe(thrown.stack);
  });
  it('sends the sentence alone for a stale read, a read the sentence does not contain, or a thrown string', () => {
    const plain = { level: 'error', kind: 'error', action: 'board', message: 'Board not saved: EACCES' };
    expect(errorDraft('board', 'Board not saved: EACCES', [read(thrown, 'EACCES', 0)], FAILURE_READ_WINDOW_MS + 1)).toEqual(plain);
    expect(errorDraft('board', 'Board not saved: EACCES', [read(thrown, 'EIO', 1000)], 1000)).toEqual(plain);
    expect(errorDraft('board', 'Board not saved: EACCES', [read('EACCES', 'EACCES', 1000)], 1000)).toEqual(plain);
  });
});

describe('rememberRead', () => {
  it('keeps only the newest few', () => {
    let reads: FailureRead[] = [];
    for (let at = 0; at < FAILURE_READS_KEPT + 3; at++) reads = rememberRead(reads, { error: undefined, text: '', at });
    expect(reads.map((each) => each.at)).toEqual(Array.from({ length: FAILURE_READS_KEPT }, (_, index) => index + 3));
  });
});
