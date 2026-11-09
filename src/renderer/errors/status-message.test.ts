import { describe, expect, it } from 'vitest';
import { ERROR_LIFETIME_MS, messageLifetime, NOTICE_LIFETIME_MS, raisesErrorBanner } from './status-message';
import { FAILURE_REPEAT_WINDOW_MS } from '../../shared/app/log-entry';

describe('messageLifetime', () => {
  it('keeps an error longer than a notice', () => {
    expect(messageLifetime('notice', 'Saved')).toBe(NOTICE_LIFETIME_MS);
    expect(messageLifetime('error', 'Board not saved: EACCES')).toBe(ERROR_LIFETIME_MS);
  });
  it('gives a long sentence the time it takes to read', () => {
    expect(messageLifetime('notice', 'x'.repeat(400))).toBeGreaterThan(NOTICE_LIFETIME_MS);
  });
});

describe('raisesErrorBanner', () => {
  it('raises one while the window is away, once a minute per sentence', () => {
    const raised = new Map<string, number>();
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', 0, false, true)).toBe(true);
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', 5000, false, true)).toBe(false);
    expect(raisesErrorBanner(raised, 'Notes not saved: EIO', 5000, false, true)).toBe(true);
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', FAILURE_REPEAT_WINDOW_MS + 5000, false, true)).toBe(true);
  });
  it('raises none with the window in front, the setting off, or a clear', () => {
    const raised = new Map<string, number>();
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', 0, true, true)).toBe(false);
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', 0, false, false)).toBe(false);
    expect(raisesErrorBanner(raised, '', 0, false, true)).toBe(false);
    // Neither was counted, so the first time it is due it is raised.
    expect(raisesErrorBanner(raised, 'Board not saved: EACCES', 1, false, true)).toBe(true);
  });
});
