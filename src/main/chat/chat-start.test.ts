import { describe, expect, it } from 'vitest';
import { startsAtOpen } from './chat-start';

describe('startsAtOpen', () => {
  it('starts a page that has one of main\'s workers', () => {
    expect(startsAtOpen(2, ['1:3', '2:4'])).toBe(true);
  });

  it('waits on a page whose workers are on other pages, or that has none', () => {
    expect(startsAtOpen(2, ['1:3', '12:4'])).toBe(false);
    expect(startsAtOpen(2, [])).toBe(false);
  });

  it('reads the manager\'s negative slot', () => {
    expect(startsAtOpen(-2, ['-2:3'])).toBe(true);
  });
});
