import { describe, expect, it } from 'vitest';
import { onEdgeLine, recall, sentPrompts } from './chat-history';

describe('recall', () => {
  it('walks back from the draft to the oldest prompt and stops there', () => {
    expect(recall(3, null, -1)).toEqual({ at: 2 });
    expect(recall(3, 1, -1)).toEqual({ at: 0 });
    expect(recall(3, 0, -1)).toBeNull();
  });
  it('walks forward to the draft and stops there', () => {
    expect(recall(3, 1, 1)).toEqual({ at: 2 });
    expect(recall(3, 2, 1)).toEqual({ at: null });
    expect(recall(3, null, 1)).toBeNull();
  });
  it('has nothing to recall before anything was sent', () => expect(recall(0, null, -1)).toBeNull());
});

describe('onEdgeLine', () => {
  it('takes Up only on the first line and Down only on the last', () => {
    expect(onEdgeLine('one\ntwo', 2, -1)).toBe(true);
    expect(onEdgeLine('one\ntwo', 5, -1)).toBe(false);
    expect(onEdgeLine('one\ntwo', 5, 1)).toBe(true);
    expect(onEdgeLine('one\ntwo', 2, 1)).toBe(false);
  });
});

describe('sentPrompts', () => {
  it('leaves out a command run with ! and blank prompts', () => {
    const user = (text: string, ran?: true) => ({ kind: 'user' as const, text, images: [], ...(ran ? { ran } : {}) });
    expect(sentPrompts([user('first'), user('! git push', true), user('  '), user('second')])).toEqual(['first', 'second']);
  });
});
