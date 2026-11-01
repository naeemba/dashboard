import { describe, expect, it } from 'vitest';
import { shouldLogError } from './error-log';

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
