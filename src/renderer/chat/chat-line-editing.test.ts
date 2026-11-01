import { describe, expect, it } from 'vitest';
import { applyChange, EMPTY_RING, planLineEdit, type Box, type KillRing } from './chat-line-editing';
import type { LineEdit } from '../../shared/keys/actions';

// Runs keys in order the way the box would, caret collapsed after each change.
function press(text: string, caret: number, edits: LineEdit[], ring: KillRing = EMPTY_RING): { box: Box; ring: KillRing } {
  let box: Box = { value: text, start: caret, end: caret };
  for (const edit of edits) {
    const planned = planLineEdit(ring, box, edit);
    ring = planned.ring;
    if (!planned.change) continue;
    const caret = planned.change.from + planned.change.insert.length;
    box = { value: applyChange(box.value, planned.change), start: caret, end: caret };
  }
  return { box, ring };
}

describe('planLineEdit', () => {
  it('kills the word before the caret, and the spaces before it', () => {
    expect(press('fix the  bug', 12, ['kill-word']).box.value).toBe('fix the  ');
    expect(press('fix the  bug', 9, ['kill-word']).box.value).toBe('fix bug');
  });

  it('kills to the start and to the end of the line, not of the box', () => {
    expect(press('one\ntwo three\nfour', 7, ['kill-line-start']).box.value).toBe('one\n three\nfour');
    expect(press('one\ntwo three\nfour', 7, ['kill-line-end']).box.value).toBe('one\ntwo\nfour');
  });

  it('takes the line break when the caret is already at the line edge', () => {
    expect(press('one\ntwo', 4, ['kill-line-start']).box.value).toBe('onetwo');
    expect(press('one\ntwo', 3, ['kill-line-end']).box.value).toBe('onetwo');
  });

  it('joins kills made one after another, in the order they stood', () => {
    const { box, ring } = press('fix the bug', 11, ['kill-word', 'kill-word', 'kill-word']);
    expect(box.value).toBe('');
    expect(ring.entries).toEqual(['fix the bug']);
    expect(press('ab cd', 0, ['kill-line-end', 'kill-line-end']).ring.entries).toEqual(['ab cd']);
  });

  it('starts a new entry once something came between two kills', () => {
    const first = press('one two', 7, ['kill-word']);
    const moved = planLineEdit(first.ring, { value: first.box.value, start: 0, end: 0 }, 'kill-line-end');
    expect(moved.ring.entries).toEqual(['one ', 'two']);
  });

  it('yanks the last kill back, and Alt+Y straight after swaps it for the one before', () => {
    const killed = press('alpha beta', 10, ['kill-word', 'kill-line-start']);
    expect(killed.ring.entries).toEqual(['alpha beta']);
    const two = press('alpha', 5, ['kill-word'], press('beta', 4, ['kill-word']).ring);
    expect(press('', 0, ['yank'], two.ring).box.value).toBe('alpha');
    expect(press('', 0, ['yank', 'yank-pop'], two.ring).box.value).toBe('beta');
    expect(press('', 0, ['yank', 'yank-pop', 'yank-pop'], two.ring).box.value).toBe('alpha');
  });

  it('refuses Alt+Y that does not follow a yank, and keys with nothing to do', () => {
    const ring = press('word', 4, ['kill-word']).ring;
    expect(planLineEdit(ring, { value: 'x', start: 1, end: 1 }, 'yank-pop').change).toBeNull();
    expect(planLineEdit(EMPTY_RING, { value: 'x', start: 1, end: 1 }, 'yank').change).toBeNull();
    expect(planLineEdit(EMPTY_RING, { value: 'x', start: 0, end: 0 }, 'kill-word').change).toBeNull();
  });

  it('kills a selection whole, and a yank replaces one', () => {
    const killed = planLineEdit(EMPTY_RING, { value: 'one two three', start: 4, end: 7 }, 'kill-line-end');
    expect(killed.change).toEqual({ from: 4, to: 7, insert: '' });
    expect(planLineEdit(killed.ring, { value: 'a b', start: 0, end: 1 }, 'yank').change).toEqual({ from: 0, to: 1, insert: 'two' });
  });
});
