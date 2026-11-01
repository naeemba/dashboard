import { selectionOf, type Board, type Selection } from './board';

// The card the next arrival on a board lands on. The manager's queue sets it before sending you to the
// board; the arrival spends it, so every later arrival starts where an arrival normally starts.
export type CardAim = {
  aimAt(cardId: string): void;
  // Where the aimed card is on the board just read, or null when nothing was aimed or the card is
  // gone. Asked once: the aim is spent whatever the answer.
  spend(board: Board): Selection | null;
};

export function createCardAim(): CardAim {
  let aimedAt: string | null = null;
  return {
    aimAt(cardId: string): void {
      aimedAt = cardId;
    },
    spend(board: Board): Selection | null {
      const found = aimedAt === null ? null : selectionOf(board, aimedAt);
      aimedAt = null;
      return found;
    },
  };
}
