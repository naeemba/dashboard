import { describe, expect, it } from 'vitest';
import { CANCELLED_COLUMN, columnNamed, emptyBoard, moveCardById, type Board } from '../../shared/board/board';
import { awaitsReview, followedPullRequest, intoReview, reviewPrompt, reviewRefused } from './review';

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
    expect(awaitsReview(moveCardById(boardWithCard(), CARD, 4) as Board, CARD)).toBe(true);
  });

  // The review's whole job is this move, so a card past Review has had one — and only this says so
  // once the restart has taken the mark off the record.
  it('is false for a card the review already moved to Done', () => {
    expect(awaitsReview(moveCardById(boardWithCard(), CARD, 5) as Board, CARD)).toBe(false);
  });

  // A board that had Cancelled before Review: position alone would pull the cancelled card into Review.
  it('is false for a cancelled card, wherever Cancelled sits', () => {
    const board = boardWithCard();
    const reordered = { columns: [board.columns[0], { name: 'Cancelled', cards: [] }, ...board.columns.slice(1)] };
    expect(awaitsReview(moveCardById(reordered, CARD, 1) as Board, CARD)).toBe(false);
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

describe('followedPullRequest', () => {
  function withNumber(column: number): Board {
    const board = moveCardById(boardWithCard(), CARD, column) as Board;
    return { columns: board.columns.map((each) => ({ ...each, cards: each.cards.map((card) => ({ ...card, pullRequest: 12 })) })) };
  }

  // Done: card.follow moves a card there only after the merge, so the number is the one that merged.
  it('is the number card.follow put on a card in Review or Done', () => {
    expect(followedPullRequest(withNumber(4), CARD)).toBe(12);
    expect(followedPullRequest(withNumber(5), CARD)).toBe(12);
  });

  // Doing: its pull request closed unmerged, or a fresh ship of it has opened nothing yet.
  it('is null before Review, in Cancelled, and without a number', () => {
    expect(followedPullRequest(withNumber(3), CARD)).toBeNull();
    expect(followedPullRequest(withNumber(columnNamed(boardWithCard(), CANCELLED_COLUMN)), CARD)).toBeNull();
    expect(followedPullRequest(moveCardById(boardWithCard(), CARD, 4) as Board, CARD)).toBeNull();
    expect(followedPullRequest(withNumber(4), 'not-on-the-board')).toBeNull();
    const noReview = { columns: [{ name: 'Done', cards: [{ id: CARD, title: 'a', notes: '', priority: 'medium' as const, parent: null, pullRequest: 12 }] }] };
    expect(followedPullRequest(noReview, CARD)).toBeNull();
  });
});

describe('intoReview', () => {
  it('moves the card into Review', () => {
    const moved = intoReview(boardWithCard(), CARD);
    expect(moved?.columns.map((column) => column.cards.map((card) => card.id)))
      .toEqual([[], [], [], [], [CARD], [], []]);
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

const WORKFLOW = '/home/u/.claude/workflows/pr-loop.js';

describe('reviewPrompt', () => {
  const prompt = reviewPrompt(CARD, 12, '/work/api', true, 'github', WORKFLOW);

  it('quotes the project path, which is allowed a space in it', () => {
    expect(reviewPrompt(CARD, 12, '/work/my api', true, 'github', WORKFLOW)).toContain("cd '/work/my api' &&");
  });

  // A folder is allowed an apostrophe too, and one left raw ends the quotes early: the agent is handed
  // `cd '/work/Bob's api'`, which is not the command anyone meant — and the fallback that tells the
  // card what went wrong is built from the same string, so the card sits in Review saying nothing.
  it('escapes an apostrophe in the project path', () => {
    const prompt = reviewPrompt(CARD, 12, "/work/Bob's api", true, 'github', WORKFLOW);
    expect(prompt).toContain(String.raw`cd '/work/Bob'\''s api' &&`);
  });

  it('names the pull request to run the loop against', () => {
    expect(prompt).toContain('/.claude/workflows/pr-loop.js` and args `"12"`');
  });

  // Retro 2026-11-26: twelve review workers each spent about six turns on /pr-loop's fixed steps (the
  // install cmp, the draft flag and two comments a turn each, a tail of the wait's output) and seven
  // armed a ScheduleWakeup nobody asked for. The set-up goes beside the Workflow call and the close is
  // chained into the wait, so the only turns left are the loop's and the judging.
  it('sets up beside the loop and closes in the wait\'s own call, without /pr-loop\'s turns', () => {
    for (const merge of [true, false]) {
      const github = reviewPrompt(CARD, 12, '/work/api', merge, 'github', WORKFLOW);
      expect(github).toContain('In one message, side by side');
      expect(github).toContain('false) gh pr ready 12 --undo && echo was ready');
      // A gh error prints nothing, which is not a draft: only `true` skips the land.
      expect(github).toContain('true) echo was a draft ;; *) echo could not read the draft flag');
      expect(github).toContain('gh pr comment 12 --body "Review loop started.');
      // The heading review-finished.ts reads to skip a loop already run at the head.
      expect(github).toContain("gh pr comment 12 --body-file - <<'END'");
      expect(github).toContain('Its first line is `Review loop finished: <status>`');
      expect(github).toContain('gh pr ready 12 && <step 2\'s command>');
      expect(github).toContain(merge ? 'pr land 12`, the last command of step 1\'s closing call' : 'pr wait 12`, the last command');
      expect(github).toContain('do not run /pr-loop itself');
      expect(github).not.toMatch(/cmp -s|tail /);
    }
    for (const forge of ['github', 'gitlab'] as const) {
      const forgePrompt = reviewPrompt(CARD, 12, '/work/api', false, forge, WORKFLOW);
      expect(forgePrompt).toContain('no ScheduleWakeup');
      expect(forgePrompt).toContain('ToolSearch `select:SendMessage`');
    }
    expect(reviewPrompt(CARD, 7, '/work/insta', false, 'gitlab', WORKFLOW)).toContain('Run /mr-loop 7.');
  });

  // The land steps copied out of a prompt had no second try on a network error and no reading back of
  // a merge call that failed: #301 was reported failed by a review that had merged it.
  it('lands through pr land, in the background, and never merges by hand', () => {
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" pr land 12`');
    expect(prompt).toContain('run_in_background, timeout 7200000');
    expect(prompt).toContain('stopped at that time limit has not failed');
    expect(prompt).toContain('a land that prints `nothing is merged, run it again`');
    // Workers ran `gh pr view` after the land's own line to check a merge that line already said.
    expect(prompt).toContain('printing `merged 12 at <sha>`, is merged: that line is gh\'s merge itself');
    expect(prompt).not.toMatch(/gh pr merge 12|--match-head-commit|gh pr checks 12 --watch/);
  });

  // On #329 a round swapped the card's rule for a heuristic of its own; with merging on, the land ran
  // with nobody asked (#339).
  it('stops before landing a round that changed the card\'s ask or design, and tells main', () => {
    for (const landing of [prompt, reviewPrompt(CARD, 7, '/work/insta', true, 'gitlab', WORKFLOW)]) {
      expect(landing).toContain('no round that changed what the card asked for or its design');
      expect(landing).toContain('a round changed what the card asked for or its design');
      expect(landing).toContain('report to main, so main asks the user whether it lands');
    }
  });

  // The pane wakes in the worktree knowing only the card's id, and a round's summary of a swapped rule
  // reads like a fix: without the card it has nothing to judge "what the card asked for" by.
  it('reads the card before judging whether a round changed it', () => {
    for (const forge of ['github', 'gitlab'] as const) {
      for (const merge of [true, false]) {
        expect(reviewPrompt(CARD, 12, '/work/api', merge, forge, WORKFLOW)).toContain(`node "$DASHBOARD_BOARD" show ${CARD}`);
      }
    }
  });

  // One session polled `gh pr checks` 166 times by hand, and `sleep N; gh pr checks` in the foreground
  // is refused: the wait is one background pr wait that wakes the agent when it exits. A hand-rolled
  // watch died on a TLS timeout pr wait tries again past.
  it('waits on CI with a background watch, not a poll, when merging is off', () => {
    const waiting = reviewPrompt(CARD, 12, '/work/api', false, 'github', WORKFLOW);
    expect(waiting).toContain('run_in_background, timeout 7200000');
    expect(waiting).toContain('stopped at that time limit has not failed');
    expect(waiting).toContain('`node "$DASHBOARD_COMMAND" pr wait 12`');
    expect(waiting).not.toMatch(/sleep 60|gh pr checks 12 --watch/);
  });

  // #290 was merged by this prompt with nobody's go-ahead.
  describe('with merging off', () => {
    const reporting = reviewPrompt(CARD, 12, '/work/api', false, 'github', WORKFLOW);

    it('runs the loop and waits for CI, and never merges', () => {
      expect(reporting).toContain('args `"12"`');
      expect(reporting).toContain('pr wait 12');
      expect(reporting).not.toContain('gh pr merge');
      expect(reporting).not.toContain('pr land');
    });

    it('reports to the project\'s main and leaves the card where it is', () => {
      expect(reporting).toContain('Your report to main');
      // Main asks the user before landing only when the report says so (#329).
      expect(reporting).toContain('whether any round changed what the card asked for or its design');
      expect(reporting).not.toContain(`move ${CARD}`);
    });

    // Main's message is gone once its session closes; the card is what the board shows a day later.
    it('says the ending on the card too', () => {
      expect(reporting).toContain(`cd '/work/api' && node "$DASHBOARD_BOARD" comment ${CARD} "<what happened>"`);
    });
  });

  // The pane runs as the author of the pull request, and GitHub refuses an approval from the author.
  // Ask for one and the agent burns a turn on a command that can only fail, then stops at step 3 and
  // leaves a landable pull request sitting in Review saying the approval was refused.
  it('does not ask for an approval the author cannot give', () => {
    expect(prompt).not.toContain('--approve');
  });

  // The reason is in reviewPrompt's comment: an agent's move can land before the merge.
  it('leaves the move to Done to the app', () => {
    expect(prompt).not.toContain(`move ${CARD}`);
  });

  // The branch's board carries nothing about the card (board-decision-7).
  it('commits nothing of the branch\'s board', () => {
    expect(prompt).not.toContain('git commit');
  });

  it('tells the agent where to say what happened when it cannot land the pull request', () => {
    expect(prompt).toContain(`cd '/work/api' && node "$DASHBOARD_BOARD" comment ${CARD} "<what happened>"`);
  });
});

// A GitLab project's merge request: gh answers nothing there, so neither does `pr wait` or `pr land`.
describe('reviewPrompt on GitLab', () => {
  const landing = reviewPrompt(CARD, 7, '/work/insta', true, 'gitlab', WORKFLOW);
  const reporting = reviewPrompt(CARD, 7, '/work/insta', false, 'gitlab', WORKFLOW);

  it('runs /mr-loop and waits on the pipeline through glab, in the background', () => {
    for (const prompt of [landing, reporting]) {
      expect(prompt).toContain('/mr-loop 7');
      expect(prompt).toContain('`glab ci status --wait`, run in the background (run_in_background, timeout 7200000');
      expect(prompt).not.toMatch(/\/pr-loop|pr wait|pr land|\bgh /);
    }
  });

  it('merges only the head it noted, and only when merging is on', () => {
    expect(landing).toContain('`glab mr merge 7 --sha <that sha> --auto-merge=false --yes`');
    expect(landing.indexOf('glab mr view 7')).toBeGreaterThan(-1);
    expect(landing.indexOf('glab mr view 7')).toBeLessThan(landing.indexOf('glab ci status --wait'));
    expect(reporting).not.toContain('glab mr merge');
    expect(reporting).toContain('Merging is off for this project');
  });

  it('says the ending on the card and leaves the move to the app', () => {
    expect(landing).toContain(`cd '/work/insta' && node "$DASHBOARD_BOARD" comment ${CARD} "<what happened>"`);
    expect(landing).not.toContain(`move ${CARD}`);
  });
});
