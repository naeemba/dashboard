import { describe, expect, it } from 'vitest';
import { addCard, columnNamed, DONE_COLUMN, emptyBoard } from './board';
import { keyboardMoveRefusal } from './done-lock';

const empty = emptyBoard();
const done = columnNamed(empty, DONE_COLUMN);

describe('keyboardMoveRefusal', () => {
  it('refuses a keyboard move of a card in Done, naming it', () => {
    const board = addCard(empty, { column: done, card: 0 }, 'card', 'Fix login').board;
    expect(keyboardMoveRefusal(board, { column: done, card: 0 })).toBe(
      '"Fix login" is in Done and moves only by dragging it, so a key on the wrong card moves nothing',
    );
  });

  it('lets a card in any other column move, and says nothing with no card selected', () => {
    const board = addCard(empty, { column: 1, card: 0 }, 'card', 'Fix login').board;
    expect(keyboardMoveRefusal(board, { column: 1, card: 0 })).toBeNull();
    expect(keyboardMoveRefusal(board, { column: done, card: 0 })).toBeNull();
  });
});
