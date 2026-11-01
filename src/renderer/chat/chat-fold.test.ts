import { describe, expect, it } from 'vitest';
import { foldedMessage } from './chat-fold';

const lines = (count: number): string => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

describe('foldedMessage', () => {
  it('shows a message of twelve lines or fewer whole', () => {
    expect(foldedMessage(lines(12))).toBeNull();
    expect(foldedMessage('one line')).toBeNull();
  });

  it('folds a longer one to its first six lines and counts the rest', () => {
    const folded = foldedMessage(lines(13));
    expect(folded?.head).toBe(lines(6));
    expect(folded?.hidden).toBe(7);
    expect(`${folded?.head}\n${folded?.rest}`).toBe(lines(13));
  });
});
