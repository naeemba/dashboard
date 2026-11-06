import type { Refused } from '../../../shared/app/bridge';
import { action } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardReviewPorts = {
  // review-flow.ts's review start: the worktree swapped for a review one and /pr-loop started in it.
  review(input: CardInput): Promise<{ output: string } | Refused>;
};

// A shipped card's review loop. card.move runs it for a card entering Review, and `dashboard board
// review <id>` runs it directly: the way to start a loop by hand with settings review.autoLoop off.
export const cardReview = action<CardReviewPorts, CardInput, { output: string }>('card.review', {
  words: ['id'],
  input: cardInput,
  run: (ports, input) => ports.review(input),
});
