import { describe, expect, it } from 'vitest';
import { stampText } from './chat-stamp';

const now = new Date(2026, 10, 1, 15, 0);

describe('stampText', () => {
  it('gives the time alone for a message written today', () => {
    expect(stampText({ at: new Date(2026, 10, 1, 9, 5).getTime(), model: 'claude-opus-5-5' }, now)).toBe('9:05am · claude-opus-5-5');
  });

  it('adds the date for a message from another day', () => {
    expect(stampText({ at: new Date(2026, 9, 30, 23, 59).getTime() }, now)).toBe('2026-10-30 11:59pm');
  });

  it('says nothing for a message that carries neither', () => {
    expect(stampText({}, now)).toBe('');
  });
});
