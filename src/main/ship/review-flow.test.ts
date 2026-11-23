import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_FOLDER_PATH, readBoard, writeBoard } from '../board/board-store';
import { CANCELLED_COLUMN, REVIEW_COLUMN, columnNamed, emptyBoard, moveCardById, type Board } from '../../shared/board/board';
import { reviewSweep, type ReviewSweep } from './review-flow';
import { intoReview } from './review';
import { CARD, boardWithCard, columnOfCard, commentsOnCard, flight, inDone, ports, sweepWith } from './review-flow-fixture';

describe('reviewSweep', () => {
  it('moves the card into Review and swaps the worktree for one that reviews it', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.added).toEqual(['ship-it']);
    expect(log.started[0].prompt).toContain('/pr-loop 12');
    expect(log.started[0].prompt).not.toContain('pr land');
  });

  it('asks the review to merge only when the project may land its pull request', async () => {
    const { entry, projectPath } = flight(12);
    const asked: string[] = [];
    const { ports: made, log } = ports(entry, { landsPullRequest: (path) => { asked.push(path); return true; } });
    await sweepWith(made).run();
    expect(asked).toEqual([projectPath]);
    expect(log.started[0].prompt).toContain('pr land 12');
  });

  // card.follow's number on the project's board, with the card in Review: an agent that recorded
  // nothing is reviewed, and one whose worktree carries an earlier pull request's number is reviewed
  // on the new one.
  it.each([[null], [12]])('reviews the pull request card.follow found, worktree number %s', async (written) => {
    const { entry, projectPath } = flight(written);
    writeBoard(projectPath, intoReview(boardWithCard(15), CARD) as Board);
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.started[0].prompt).toContain('/pr-loop 15');
  });

  // A re-ship after #12 closed unmerged: the project's card back out of Review still carries 12, and the
  // worktree cut from the base has it too. That is the closed pull request, not a finished agent.
  it('does not review a worktree number the project card already carries', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, boardWithCard(12));
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.started).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Backlog');
  });

  // The pull request number is the whole signal. Until there is one the agent is still working, and a
  // sweep that took its worktree away would take the work with it.
  it('leaves a card whose agent has not opened a pull request alone', async () => {
    const { entry, projectPath } = flight(null);
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(columnOfCard(projectPath)).toBe('Backlog');
    expect(log.removed).toEqual([]);
  });

  it('does not start a second review for a worktree that is already reviewing', async () => {
    const { entry } = flight(12);
    const { ports: made, log } = ports({ ...entry, reviewing: true });
    await sweepWith(made).run();
    expect(log.removed).toEqual([]);
  });

  // The number lands on the card mid-run: /work-card pushes that commit and keeps going. Take the
  // folder then and `git worktree remove` kills the shell before the next push, so a commit that is on
  // the branch never reaches the pull request the review is about to merge.
  it('waits for the agent that opened the pull request to stop working', async () => {
    const { entry, projectPath } = flight(12);
    let working = true;
    const { ports: made, log } = ports(entry, { agentWorksIn: () => working });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Backlog');
    // Nothing was marked, so the tick after it goes quiet picks the card up.
    working = false;
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // #300 and #313: stopped when the sweep looked, at work when the start looked, then its pane closed.
  it('starts the review on a later tick when the start found the agent back at work, after its pane closed', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, intoReview(boardWithCard(12), CARD) as Board);
    let current = entry;
    const looks = [false, true];
    const { ports: made, log } = ports(entry, {
      worktrees: () => [current],
      agentWorksIn: (_slot, pane) => pane !== null && (looks.shift() ?? false),
    });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.started).toEqual([]);
    current = { ...entry, pane: null };
    await sweep.run();
    expect(log.started[0].prompt).toContain('/pr-loop 12');
    expect(columnOfCard(projectPath)).toBe('Review');
  });

  // The project closes while the sweep's move waits on the board's push: refused, and unmarked.
  it('starts the review on a later tick when the project closed before the start looked', async () => {
    const { entry } = flight(12);
    const slots = [0, -1];
    const { ports: made, log } = ports(entry, { slotOf: () => slots.shift() ?? 0 });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.started).toEqual([]);
    await sweep.run();
    expect(log.started[0].prompt).toContain('/pr-loop 12');
  });

  // Cancelled while the sweep's move waits: refused, and unmarked, so moving it back reviews it.
  it('starts the review once a card cancelled before the start looked is moved back to Review', async () => {
    const { entry, projectPath } = flight(12);
    let cancelOnce = true;
    const { ports: made, log } = ports(entry);
    const sweep: ReviewSweep = reviewSweep({
      ...made,
      arrived: (arrived) => {
        if (cancelOnce) {
          cancelOnce = false;
          const board = boardWithCard(null);
          writeBoard(projectPath, moveCardById(board, CARD, columnNamed(board, CANCELLED_COLUMN)) ?? board);
        }
        return sweep.review(arrived.cardId);
      },
    });
    await sweep.run();
    expect(log.started).toEqual([]);
    writeBoard(projectPath, intoReview(boardWithCard(null), CARD) as Board);
    await sweep.run();
    expect(log.started[0].prompt).toContain('/pr-loop 12');
  });

  // Merging off: the loop finished and the card waits in Review for the user. A restart wiped the
  // sweep's mark, and without asking the pull request the first tick ran a second loop at it.
  it('starts no second review of a card in Review whose loop finished at the head commit', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, intoReview(boardWithCard(12), CARD) as Board);
    const asked: number[] = [];
    const { ports: made, log } = ports(entry, { reviewFinished: async (_path, pullRequest) => { asked.push(pullRequest); return true; } });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(asked).toEqual([12]);
    expect(log.removed).toEqual([]);
    expect(log.started).toEqual([]);
  });

  // The card is still in Review, so nothing reviewed it to the end: the shell died with the app. That
  // one is reviewed again, which is what losing a review means.
  it('reviews a card again when the last review died in Review', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 4) ?? boardWithCard(null));
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(columnOfCard(projectPath)).toBe('Review');
  });

  // The card has left the project's board — deleted once its review was done, or lost with a board.json
  // that would not parse and was moved aside. The worktree outlives it by design, and a board that does
  // not mention the card cannot say whether it has been reviewed, so the sweep says nothing and touches
  // nothing: reviewing it would re-cut the worktree and run /pr-loop at a pull request that merged weeks
  // ago, with no card anywhere to print that on.
  it('leaves a card the project board no longer mentions alone', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, emptyBoard());
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.removed).toEqual([]);
    expect(log.started).toEqual([]);
  });

  // The deleted card. Its worktree stays on disk for good, so without the mark it reads two boards every
  // five seconds for the rest of the run for an answer that cannot change.
  it('asks once about a card a populated board has lost', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, boardWithCard(null, 'b0a1'));
    const { ports: made, log } = ports(entry);
    const sweep = sweepWith(made);
    await sweep.run();
    // Put the card back and it stays marked: that id is gone, and a ship of a new card calls forget.
    writeBoard(projectPath, boardWithCard(null));
    await sweep.run();
    expect(log.removed).toEqual([]);
  });

  // The salvaged board. Every card is missing at once and every one of them comes back the moment the
  // file is restored, so marking here would stop reviews until the app was restarted.
  it('asks again about a card an empty board has lost once the board is back', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, emptyBoard());
    const { ports: made, log } = ports(entry);
    const sweep = sweepWith(made);
    await sweep.run();
    writeBoard(projectPath, boardWithCard(null));
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // One card's file set aside. The board still has cards on it, so only the set-aside file tells this
  // apart from the deletion above, and marking here would stop reviews once the file is restored.
  it('asks again about a card whose file was set aside once the file is back', async () => {
    const { entry, projectPath } = flight(12);
    const [first, ...rest] = boardWithCard(null).columns;
    writeBoard(projectPath, { columns: [{ ...first, cards: [...first.cards, { ...first.cards[0], id: 'b0a1' }] }, ...rest] });
    writeFileSync(join(projectPath, BOARD_FOLDER_PATH, 'cards', `${CARD}.json`), '{ "id": ');
    const { ports: made, log } = ports(entry);
    const sweep = sweepWith(made);
    await sweep.run();
    writeBoard(projectPath, boardWithCard(null));
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // Panes belong to an open project. Nothing is marked, so opening the project starts the review.
  it('waits for a closed project rather than refusing the card', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, { slotOf: () => -1 });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Backlog');
  });

  it('refuses a review whose /pr-loop is missing, says so on the card, and checks nothing', async () => {
    const { entry, projectPath } = flight(12);
    let checked = 0;
    const { ports: made, log } = ports(entry, { loopMissing: () => '/pr-loop is not installed', loopChecked: () => { checked += 1; } });
    expect(await sweepWith(made).review(CARD)).toEqual({ refused: '/pr-loop is not installed' });
    expect(log.removed).toEqual([]);
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: /pr-loop is not installed']);
    expect(checked).toBe(0);
  });

  it('checks the installed /pr-loop at each review start', async () => {
    const { entry } = flight(12);
    let checked = 0;
    const { ports: made } = ports(entry, { loopChecked: () => { checked += 1; } });
    await sweepWith(made).run();
    expect(checked).toBe(1);
  });

  // Nothing on screen is waiting on a review, so the card is the only place this can be said.
  it('lands the card in Review and says on it when the worktree is dirty', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => ({ ok: false, message: '', dirty: ['src/a.ts', 'src/b.ts'] }),
    });
    await sweepWith(made).run();
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.added).toEqual([]);
    expect(commentsOnCard(projectPath))
      .toEqual(['No review worktree: uncommitted changes in ship-it, waiting for the commit']);
  });

  // The bug this was written for. `/work-card` opens the pull request and keeps going, and a tick
  // landing while its last fix commit is still being made finds the worktree dirty. Marked for good, the pull request sits in Review with nobody reviewing it
  // until the app restarts — which is a card nobody notices for a day.
  it('tries a dirty worktree again on the next tick, and reviews it once the commit lands', async () => {
    const { entry, projectPath } = flight(12);
    let committed = false;
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => (committed
        ? { ok: true, message: '', dirty: [] }
        : { ok: false, message: '', dirty: ['src/app.ts'] }),
    });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.added).toEqual([]);
    committed = true;
    await sweep.run();
    expect(log.added).toEqual(['ship-it']);
    expect(log.started[0].prompt).toContain('/pr-loop 12');
    expect(columnOfCard(projectPath)).toBe('Review');
  });

  // One line, however many ticks it takes. The trail is append-only, so a worktree somebody walked away
  // from mid-change would otherwise bury its own card under a copy of the same sentence every five
  // seconds.
  //
  // The agent keeps saving while it sits there, so the file list grows between ticks. The line is only
  // one line if nothing in it counts them — reviewRefused matches the whole sentence, so a count would
  // make each tick a new one and stack them all.
  it('says a dirty worktree once however many times it retries', async () => {
    const { entry, projectPath } = flight(12);
    const dirtying = [['src/a.ts'], ['src/a.ts', 'src/b.ts'], ['src/a.ts', 'src/b.ts', 'src/c.ts']];
    const { ports: made } = ports(entry, {
      removeWorktree: async () => ({ ok: false, message: '', dirty: dirtying.shift() ?? ['src/a.ts'] }),
    });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    await sweep.run();
    expect(commentsOnCard(projectPath))
      .toEqual(['No review worktree: uncommitted changes in ship-it, waiting for the commit']);
  });

  // The refusal leaves the record exactly as it was, so only the mark stops the next tick spawning git
  // at the same card again. A locked repository is not a condition that passes by itself, which is what
  // separates it from the dirty worktree above.
  it('tries a refused card once and not again', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => ({ ok: false, message: 'not removed: locked', dirty: [] }),
    });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: not removed: locked']);
  });

  // Shipping the card again is a new pull request, and it has to be reviewable.
  it('reviews a card again once it has been shipped again', async () => {
    const { entry } = flight(12);
    let attempts = 0;
    const { ports: made } = ports(entry, {
      removeWorktree: async () => {
        attempts += 1;
        return { ok: false, message: 'not removed: locked', dirty: [] };
      },
    });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(attempts).toBe(1);
    sweep.forget(CARD);
    await sweep.run();
    expect(attempts).toBe(2);
  });

  // The worktree is swapped by then, so the only thing left to say is on the card.
  it('says on the card when the pane could not be taken', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made } = ports(entry, {
      startReview: async () => ({ ok: false, message: 'api was closed mid-ship' }),
    });
    await sweepWith(made).run();
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: api was closed mid-ship']);
  });

  // git throwing must not take the sweep down with it, and the card has to say what happened.
  it('puts a step that threw on the card rather than letting it escape', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made } = ports(entry, {
      addWorktree: async () => { throw new Error('fatal: ship-it is already checked out'); },
    });
    await sweepWith(made).run();
    expect(commentsOnCard(projectPath))
      .toEqual(['No review worktree: review failed: fatal: ship-it is already checked out']);
  });

  // settings review.autoLoop off: card.move puts the card in Review and starts nothing, once.
  it('with the loop off, notices a finished card once and leaves the review to a person', async () => {
    const { entry, projectPath } = flight(12);
    let arrivals = 0;
    const { ports: made, log } = ports(entry, {
      arrived: async (arrived) => {
        arrivals += 1;
        writeBoard(arrived.projectPath, intoReview(readBoard(arrived.projectPath).board, arrived.cardId) ?? readBoard(arrived.projectPath).board);
      },
    });
    const sweep = reviewSweep(made);
    await sweep.run();
    await sweep.run();
    expect(arrivals).toBe(1);
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.started).toEqual([]);
    await expect(sweep.review(CARD)).resolves.toEqual({ output: 'review started for "Ship it", pull request #12' });
    expect(log.started).toHaveLength(1);
  });

  // The loop off, a review started by hand a moment before the agent's commit: the sweep's own retry
  // goes through card.move, which starts nothing with the loop off, so the start by hand is retried.
  it('with the loop off, retries a review started by hand that met a dirty worktree', async () => {
    const { entry, projectPath } = flight(12);
    let committed = false;
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => (committed
        ? { ok: true, message: '', dirty: [] }
        : { ok: false, message: '', dirty: ['.dashboard/board.json'] }),
    });
    const sweep = reviewSweep(made);
    await expect(sweep.review(CARD)).resolves.toEqual({ refused: 'uncommitted changes in ship-it, waiting for the commit' });
    committed = true;
    await sweep.run();
    expect(log.started).toHaveLength(1);
    expect(columnOfCard(projectPath)).toBe('Review');
  });

  // The loop on when the sweep's start met the dirty worktree, then turned off before the commit: the
  // retry is the sweep's move again, which now leaves the card waiting in Review.
  it('retries a sweep start that met a dirty worktree through the move, not as a start by hand', async () => {
    const { entry } = flight(12);
    let committed = false;
    let loopOn = true;
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => (committed
        ? { ok: true, message: '', dirty: [] }
        : { ok: false, message: '', dirty: ['.dashboard/board.json'] }),
    });
    const sweep: ReviewSweep = reviewSweep({
      ...made,
      arrived: async (arrived) => (loopOn ? sweep.review(arrived.cardId) : undefined),
    });
    await sweep.run();
    loopOn = false;
    committed = true;
    await sweep.run();
    expect(log.started).toEqual([]);
  });

  it('refuses a review by hand for a card the project board does not show', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, boardWithCard(null, 'another-card'));
    const { ports: made, log } = ports(entry);
    await expect(reviewSweep(made).review(CARD))
      .resolves.toEqual({ refused: '"Ship it" is not on the project\'s board, or the board could not be read' });
    expect(log.removed).toEqual([]);
  });

  it('refuses a review by hand for a card past Review', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, inDone(12));
    const { ports: made, log } = ports(entry);
    await expect(reviewSweep(made).review(CARD)).resolves.toEqual({ refused: '"Ship it" is past Review; its review has run' });
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Done');
  });

  it('refuses a review by hand for a cancelled card, saying so rather than that its review ran', async () => {
    const { entry, projectPath } = flight(12);
    const board = boardWithCard(null);
    writeBoard(projectPath, moveCardById(board, CARD, columnNamed(board, CANCELLED_COLUMN)) ?? board);
    const { ports: made } = ports(entry);
    await expect(reviewSweep(made).review(CARD))
      .resolves.toEqual({ refused: '"Ship it" is cancelled; move it out of Cancelled to review it' });
    expect(columnOfCard(projectPath)).toBe('Cancelled');
  });

  it('refuses a review by hand while the agent works, before it has a pull request, and twice', async () => {
    const working = flight(12);
    await expect(reviewSweep(ports(working.entry, { agentWorksIn: () => true }).ports).review(CARD))
      .resolves.toEqual({ refused: 'the agent on "Ship it" is still working' });
    const early = flight(null);
    await expect(reviewSweep(ports(early.entry).ports).review(CARD))
      .resolves.toMatchObject({ refused: expect.stringMatching(/^"Ship it": the app has not seen a pull request on ship-it yet; it moves the card into Review/) });
    await expect(reviewSweep(ports(early.entry).ports).review('other'))
      .resolves.toEqual({ refused: 'card other has no worktree to review; ship it first' });
    const twice = flight(12);
    const sweep = reviewSweep(ports(twice.entry).ports);
    const first = sweep.review(CARD);
    await expect(sweep.review(CARD)).resolves.toEqual({ refused: '"Ship it" is already being reviewed' });
    await first;
  });

  // Just after the agent opens its pull request: the card is still in Doing with no number on it until
  // the pull request sweep next asks gh, and the review by hand runs the card's follow rather than refuse.
  it('runs the card follow before refusing a review by hand, and starts on the pull request it finds', async () => {
    const { entry, projectPath } = flight(null);
    const followed: string[] = [];
    const { ports: made, log } = ports(entry, {
      follow: async (_projectPath, id) => {
        followed.push(id);
        const board = boardWithCard(12);
        writeBoard(projectPath, moveCardById(board, CARD, columnNamed(board, REVIEW_COLUMN)) ?? board);
        return { output: 'Ship it  →  Review', ran: 'nothing' };
      },
    });
    await expect(reviewSweep(made).review(CARD)).resolves.toEqual({ output: 'review started for "Ship it", pull request #12' });
    expect(followed).toEqual([CARD]);
    expect(log.started).toHaveLength(1);
  });

  it('answers with the follow when its move into Review started the review, starting nothing more', async () => {
    const { entry } = flight(null);
    const started = { output: 'Ship it  →  Review\nreview started for "Ship it", pull request #12', ran: 'review' as const };
    const { ports: made, log } = ports(entry, { follow: async () => started });
    await expect(reviewSweep(made).review(CARD)).resolves.toEqual(started);
    expect(log.started).toEqual([]);
  });

  it('answers with the refusal when the start the follow made was refused, trying no second start', async () => {
    const { entry } = flight(null);
    const refused = { refused: 'Ship it  →  Review; the worktree has changes nobody committed' };
    const { ports: made, log } = ports(entry, { follow: async () => refused });
    await expect(reviewSweep(made).review(CARD)).resolves.toEqual(refused);
    expect(log.started).toEqual([]);
  });

  it('refuses as before when gh cannot answer the follow, asking it once', async () => {
    const { entry } = flight(null);
    let asked = 0;
    const { ports: made } = ports(entry, { follow: async () => { asked += 1; throw new Error('gh: offline'); } });
    await expect(reviewSweep(made).review(CARD))
      .resolves.toMatchObject({ refused: expect.stringMatching(/the app has not seen a pull request on ship-it yet/) });
    expect(asked).toBe(1);
  });
});
