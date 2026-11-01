import { describe, expect, it } from 'vitest';
import { revealed } from './chat-reveal';

describe('revealed', () => {
  it('shows a few more characters of a short tail each frame', () => {
    expect(revealed('Hel', 'Hello there')).toBe('Hello ');
  });

  it('takes an eighth of a long burst at once, so it never lags far behind', () => {
    const target = 'x'.repeat(800);
    expect(revealed('', target)).toHaveLength(100);
  });

  it('stops at the text there is, and starts over for a new block', () => {
    expect(revealed('Hello', 'Hello')).toBe('Hello');
    expect(revealed('old block', 'new')).toBe('new');
  });
});
