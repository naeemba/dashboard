import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, type Board } from '../../../shared/board/board';
import { bind } from '../action';
import { cardReview, type CardReviewInput } from './review';

function boardWith(...ids: string[]): Board {
  return ids.reduce((board, id) => addCard(board, { column: 0, card: 0 }, id, id).board, emptyBoard());
}

function review(board: Board) {
  const asked: CardReviewInput[] = [];
  const bound = bind(cardReview, { read: () => board, review: async (input) => { asked.push(input); return { output: 'started' }; } });
  return { call: bound.call, asked };
}

describe('card.review', () => {
  // `board review 6ad9d4f4` was told the card had no worktree, the refusal for a card nobody shipped.
  it('asks for the review of the whole id a short one names, refusing one two cards start', async () => {
    const { call, asked } = review(boardWith('card'));
    await expect(call({ projectPath: '/work/api', id: 'ca' })).resolves.toEqual({ output: 'started' });
    expect(asked).toMatchObject([{ id: 'card' }]);
    await expect(review(boardWith('card', 'cart')).call({ projectPath: '/work/api', id: 'ca' })).resolves.toMatchObject({ refused: expect.stringContaining('more than one') });
  });
});
