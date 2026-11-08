import { describe, expect, it } from 'vitest';
import { addCard, CANCELLED_COLUMN, columnNamed, DONE_COLUMN, emptyBoard } from './board';
import { deleteKeyOutcome } from './card-delete';

const empty = emptyBoard();
const cancelled = columnNamed(empty, CANCELLED_COLUMN);

describe('deleteKeyOutcome', () => {
  it('moves a card outside Cancelled there', () => {
    const { board, selection } = addCard(empty, { column: 1, card: 0 }, 'a', 'Card');
    expect(deleteKeyOutcome(board, selection)).toEqual({ kind: 'cancel', column: cancelled });
  });

  it('deletes a card already in Cancelled', () => {
    const { board, selection } = addCard(empty, { column: cancelled, card: 0 }, 'a', 'Card');
    expect(deleteKeyOutcome(board, selection)).toEqual({ kind: 'delete' });
  });

  // Done's lock (board-decision-3): a stray `d` on a merged card must not cancel it unasked.
  it('refuses a card in Done, as a keyboard move out of it is', () => {
    const { board, selection } = addCard(empty, { column: columnNamed(empty, DONE_COLUMN), card: 0 }, 'a', 'Card');
    expect(deleteKeyOutcome(board, selection)).toMatchObject({ kind: 'refused' });
  });

  it('deletes as before on a board with no Cancelled column', () => {
    const { board, selection } = addCard({ columns: [{ name: 'Todo', cards: [] }] }, { column: 0, card: 0 }, 'a', 'Card');
    expect(deleteKeyOutcome(board, selection)).toEqual({ kind: 'delete' });
  });

  it('does nothing with no card selected', () => {
    expect(deleteKeyOutcome(empty, { column: 0, card: 0 })).toBeNull();
  });
});
