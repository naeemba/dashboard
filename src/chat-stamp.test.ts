import { describe, expect, it } from 'vitest';
import { stampText } from './chat-stamp';

const earlier = new Date(2026, 10, 1, 8, 0).getTime();

describe('stampText', () => {
  it('gives the time alone for a message on the same day as the one before it', () => {
    expect(stampText({ at: new Date(2026, 10, 1, 9, 5).getTime(), model: 'claude-opus-5-5' }, earlier)).toBe('9:05am · claude-opus-5-5');
  });

  it('adds the date on the first message of a new day', () => {
    expect(stampText({ at: new Date(2026, 10, 2, 9, 10).getTime() }, new Date(2026, 10, 1, 23, 4).getTime())).toBe('2026-11-02 9:10am');
  });

  it('adds the date on the first stamped message of the conversation', () => {
    expect(stampText({ at: new Date(2026, 9, 30, 23, 59).getTime() }, undefined)).toBe('2026-10-30 11:59pm');
  });

  it('says nothing for a message that carries neither', () => {
    expect(stampText({}, earlier)).toBe('');
  });
});
