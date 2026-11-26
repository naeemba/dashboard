import type { Refused } from '../../../shared/app/bridge';
import type { ReturnTo } from '../../workers/pane-pool';
import { columnsBack } from '../../workers/pane-queue-store';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardReviewInput = CardInput & { returnTo: ReturnTo | null };

export type CardReviewPorts = {
  // pane.start: review-flow.ts's review start (the worktree swapped for a review one and /pr-loop
  // started in it) now when a worker slot is free, or queued until one frees.
  review(input: CardReviewInput): Promise<{ output: string } | Refused>;
};

// A shipped card's review loop. card.move runs it for a card entering Review, with the move for a
// withdrawal from the queue to undo, and `dashboard board review <id>` runs it directly: the way to
// start a loop by hand with settings review.autoLoop off.
export const cardReview = action<CardReviewPorts, CardReviewInput, { output: string }>('card.review', {
  words: ['id'],
  input(raw) {
    const card = cardInput(raw);
    if (isRefused(card)) return card;
    const returnTo = columnsBack(raw.returnTo ?? null);
    return returnTo === undefined ? { refused: 'the review was not one the app could read' } : { ...card, returnTo };
  },
  run: (ports, input) => ports.review(input),
});
