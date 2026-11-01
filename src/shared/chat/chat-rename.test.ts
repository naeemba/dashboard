import { describe, expect, it } from 'vitest';
import { renameTarget } from './chat-rename';

describe('renameTarget', () => {
  it('renames the conversation on screen to the name typed', () => {
    expect(renameTarget('a', 'Board drag')).toEqual({ sessionId: 'a', title: 'Board drag' });
  });
  it('refuses with no name, and with no conversation on screen', () => {
    expect(renameTarget('a', '')).toHaveProperty('refused');
    expect(renameTarget(null, 'Board drag')).toHaveProperty('refused');
  });
});
