import { describe, expect, it } from 'vitest';
import { firstShow } from './chat-first-show';

describe('firstShow', () => {
  // A second visit starting another CLI is the memory the lazy start saves.
  it('starts on the first show and not on the next', () => {
    const show = firstShow();
    expect(show.take()).toBe(true);
    expect(show.take()).toBe(false);
  });

  it('starts again once a new conversation rearms it', () => {
    const show = firstShow();
    show.take();
    show.rearm();
    expect(show.take()).toBe(true);
    expect(show.take()).toBe(false);
  });
});
