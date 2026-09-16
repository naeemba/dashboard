import { describe, expect, it } from 'vitest';
import { emptyBoard, type Board } from './board';
import { intoReview, reviewPrompt, reviewRefused } from './review';

const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function boardWithCard(): Board {
  const board = emptyBoard();
  return {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id: CARD, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
      : column)),
  };
}

describe('intoReview', () => {
  it('moves the card into Review', () => {
    const moved = intoReview(boardWithCard(), CARD);
    expect(moved?.columns.map((column) => column.cards.map((card) => card.id)))
      .toEqual([[], [], [], [CARD], []]);
  });

  // Null rather than the board unchanged, so the caller writes nothing: the file's bytes and its
  // mtime are left alone and the watcher does not redraw every board for a move that did not happen.
  it('is null when the card is already in Review', () => {
    const moved = intoReview(boardWithCard(), CARD);
    expect(moved).not.toBeNull();
    expect(intoReview(moved as Board, CARD)).toBeNull();
  });

  it('is null for a card made on the branch that the project has never seen', () => {
    expect(intoReview(boardWithCard(), 'made-on-the-branch')).toBeNull();
  });

  // A board somebody took the column out of. There is nowhere to put the card, and inventing a column
  // on their board is not this function's to do.
  it('is null when the board has no Review column', () => {
    const board = { columns: [{ name: 'Todo', cards: [{ id: CARD, title: 'a', notes: '', priority: 'medium' as const, parent: null }] }] };
    expect(intoReview(board, CARD)).toBeNull();
  });
});

describe('reviewRefused', () => {
  it('appends a line saying why no review is running', () => {
    const said = reviewRefused(boardWithCard(), CARD, '2 uncommitted files in ship-it');
    expect(said?.columns[0].cards[0].comments?.map((comment) => comment.body))
      .toEqual(['No review worktree: 2 uncommitted files in ship-it']);
  });

  it('is null for a card that is not on this board', () => {
    expect(reviewRefused(boardWithCard(), 'someone-else', 'whatever')).toBeNull();
  });

  // The trail is append-only and the sweep tries each card once per run of the app, so a worktree that
  // stays dirty would otherwise leave the card another copy of the same line every restart.
  it('says nothing twice in a row', () => {
    const said = reviewRefused(boardWithCard(), CARD, 'locked');
    expect(reviewRefused(said as Board, CARD, 'locked')).toBeNull();
  });

  it('says a different reason even when one is already there', () => {
    const said = reviewRefused(boardWithCard(), CARD, 'locked');
    const again = reviewRefused(said as Board, CARD, '1 uncommitted file in ship-it');
    expect(again?.columns[0].cards[0].comments).toHaveLength(2);
  });
});

describe('reviewPrompt', () => {
  const prompt = reviewPrompt(CARD, 12, '/work/api');

  it('quotes the project path, which is allowed a space in it', () => {
    expect(reviewPrompt(CARD, 12, '/work/my api')).toContain("cd '/work/my api' &&");
  });

  it('names the pull request to run the loop against', () => {
    expect(prompt).toContain('/pr-loop 12');
    expect(prompt).toContain('gh pr merge 12 --merge');
  });

  // The pane wakes up in a checkout of the branch, whose own .dashboard board is the branch's copy.
  // The move to Done is about the project's board, so the prompt has to say where that is.
  it('moves the card on the project board rather than the one under the pane', () => {
    expect(prompt).toContain(`cd '/work/api' && node "$DASHBOARD_BOARD" move ${CARD} Done`);
  });

  it('tells the agent where to say what happened when it cannot land the pull request', () => {
    expect(prompt).toContain(`cd '/work/api' && node "$DASHBOARD_BOARD" comment ${CARD} "<what happened>"`);
  });
});
