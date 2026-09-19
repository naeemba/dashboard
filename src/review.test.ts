import { describe, expect, it } from 'vitest';
import { emptyBoard, moveCardById, type Board } from './board';
import { awaitsReview, intoReview, reviewPrompt, reviewRefused } from './review';

const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function boardWithCard(): Board {
  const board = emptyBoard();
  return {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id: CARD, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
      : column)),
  };
}

describe('awaitsReview', () => {
  it('is true for a card still waiting to be worked', () => {
    expect(awaitsReview(boardWithCard(), CARD)).toBe(true);
  });

  // A review that died with the app leaves the card here. There is nothing else to go on, so it is
  // reviewed again.
  it('is true for a card sitting in Review', () => {
    expect(awaitsReview(moveCardById(boardWithCard(), CARD, 3) as Board, CARD)).toBe(true);
  });

  // The review's whole job is this move, so a card past Review has had one — and only this says so
  // once the restart has taken the mark off the record.
  it('is false for a card the review already moved to Done', () => {
    expect(awaitsReview(moveCardById(boardWithCard(), CARD, 4) as Board, CARD)).toBe(false);
  });

  // Not true — the card is gone from the board, deleted after its review or lost with a board.json that
  // would not parse, and the worktree outlives it because the review prompt says not to remove it. Told
  // "review it", the sweep re-cuts that worktree and runs /pr-loop at a pull request that merged last
  // week, with no card left to say so on.
  it('is null for a card this board does not mention', () => {
    expect(awaitsReview(boardWithCard(), 'no-longer-on-the-board')).toBeNull();
  });

  // No Review column is no column to be past.
  it('is true on a board with no Review column', () => {
    const board = { columns: [{ name: 'Done', cards: [{ id: CARD, title: 'a', notes: '', priority: 'medium' as const, parent: null }] }] };
    expect(awaitsReview(board, CARD)).toBe(true);
  });
});

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
  const prompt = reviewPrompt(CARD, 12, '/work/api', 'Ship it');

  it('quotes the project path, which is allowed a space in it', () => {
    expect(reviewPrompt(CARD, 12, '/work/my api', 'Ship it')).toContain("cd '/work/my api' &&");
  });

  // A folder is allowed an apostrophe too, and one left raw ends the quotes early: the agent is handed
  // `cd '/work/Bob's api'`, which is not the command anyone meant — and the fallback that tells the
  // card what went wrong is built from the same string, so the card sits in Review saying nothing.
  it('escapes an apostrophe in the project path', () => {
    const prompt = reviewPrompt(CARD, 12, "/work/Bob's api", 'Ship it');
    expect(prompt).toContain(String.raw`cd '/work/Bob'\''s api' &&`);
  });

  it('names the pull request to run the loop against', () => {
    expect(prompt).toContain('/pr-loop 12');
    expect(prompt).toContain('gh pr merge 12 --merge');
  });

  // The pane runs as the author of the pull request, and GitHub refuses an approval from the author.
  // Ask for one and the agent burns a turn on a command that can only fail, then stops at step 4 and
  // leaves a landable pull request sitting in Review saying the approval was refused.
  it('does not ask for an approval the author cannot give', () => {
    expect(prompt).not.toContain('--approve');
  });

  // The whole of the ordering, and the only test that needs to name either move. The branch's board is
  // what the merge copies into main, so a Done that lands after the merge never reaches main at all:
  // main goes on committing Review for a card that shipped, and the only copy that says Done is an
  // uncommitted change in one person's checkout.
  //
  // The project's move is the second half. The pane wakes up in a checkout of the branch, whose own
  // .dashboard board is the branch's copy, so the prompt has to say where the app's board is — and an
  // index found for it here is that line being present at all.
  it('moves and commits the branch board before the merge, and the project board after', () => {
    const branchMove = prompt.indexOf(`node "$DASHBOARD_BOARD" move ${CARD} Done && git add`);
    const merge = prompt.indexOf('gh pr merge 12 --merge');
    const projectMove = prompt.indexOf(`cd '/work/api' && node "$DASHBOARD_BOARD" move ${CARD} Done`);
    expect(branchMove).toBeGreaterThan(-1);
    expect(branchMove).toBeLessThan(merge);
    expect(merge).toBeLessThan(projectMove);
  });

  // The move and the commit that makes it real, in one command. Split in two, an agent that stops
  // between them leaves the branch board written and uncommitted — which is both the drift this
  // ordering exists to stop and the thing that makes git refuse to give the worktree up.
  //
  // The commit is skipped when nothing staged, so running the whole thing a second time is not an
  // error. Without that, a review pane restarted after it had already moved the card dies on `git
  // commit` having nothing to commit, before the push and before the merge — and reports that git
  // refused, about a pull request that was ready to land.
  it('commits the branch board in the same command that writes it, and survives a second run', () => {
    expect(prompt).toContain(
      `node "$DASHBOARD_BOARD" move ${CARD} Done && git add -- .dashboard/board.json`
      + ' && { git diff --cached --quiet -- .dashboard/board.json'
      + " || git commit -m 'board: \"Ship it\" is done' -- .dashboard/board.json; } && git push",
    );
  });

  // A title is a person's sentence and is allowed an apostrophe. Left raw it ends the single quotes
  // early, and the agent is handed a commit message that is not the one anyone wrote.
  it('escapes an apostrophe in the card title', () => {
    expect(reviewPrompt(CARD, 12, '/work/api', "Bob's card"))
      .toContain(String.raw`git commit -m 'board: "Bob'\''s card" is done'`);
  });

  it('tells the agent where to say what happened when it cannot land the pull request', () => {
    expect(prompt).toContain(`cd '/work/api' && node "$DASHBOARD_BOARD" comment ${CARD} "<what happened>"`);
  });
});
