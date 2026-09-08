import { describe, expect, it } from 'vitest';
import { relativeAge } from './age';

const now = Date.parse('2026-09-08T12:00:00.000Z');

function ago(milliseconds: number): string | null {
  return relativeAge(new Date(now - milliseconds).toISOString(), now);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeAge', () => {
  it('says just now for anything under a minute', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59 * 1000)).toBe('just now');
  });

  it('picks the largest unit that fits', () => {
    expect(ago(5 * MINUTE)).toBe('5 minutes ago');
    expect(ago(3 * HOUR)).toBe('3 hours ago');
    expect(ago(3 * DAY)).toBe('3 days ago');
    expect(ago(60 * DAY)).toBe('2 months ago');
    expect(ago(400 * DAY)).toBe('last year');
  });

  // Rounding here would age a card a whole day early, which is the one thing this text is read for.
  it('truncates rather than rounds', () => {
    expect(ago(Math.round(1.9 * DAY))).toBe('yesterday');
  });

  // A clock that went backwards, or a hand-typed date in the future. It must still say something.
  it('copes with a timestamp ahead of now', () => {
    expect(relativeAge(new Date(now + 2 * DAY).toISOString(), now)).toBe('in 2 days');
  });

  // .dashboard/CLAUDE.md invites hand-editing, so this is a thing people will write.
  it('says nothing about text that is not a date', () => {
    expect(relativeAge('last tuesday', now)).toBe(null);
    expect(relativeAge('', now)).toBe(null);
  });
});
