import { describe, expect, it } from 'vitest';
import { promptParts, withdrawable } from './chat-queue';

const queued = [{ id: 'a', content: [{ type: 'text' as const, text: 'first' }] }, { id: 'b', content: [{ type: 'text' as const, text: 'second' }] }];

describe('promptParts', () => {
  it('splits a prompt into its text and its images', () => {
    expect(promptParts([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: 'look' },
    ])).toEqual({ text: 'look', images: [{ mediaType: 'image/png', data: 'AAA' }] });
  });
});

describe('withdrawable', () => {
  it('takes back the last queued prompt from an empty box', () => expect(withdrawable(queued, '', 0)?.id).toBe('b'));
  it('leaves a draft alone', () => expect(withdrawable(queued, 'half typed', 0)).toBeNull());
  it('leaves attached images alone', () => expect(withdrawable(queued, '', 1)).toBeNull());
  it('has nothing to take with nothing queued', () => expect(withdrawable([], '', 0)).toBeNull());
});
