import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, BOARD_FOLDER_PATH, readBoard, writeBoard } from '../board/board-store';
import { CANCELLED_COLUMN, columnNamed, emptyBoard, moveCardById, setPullRequest, type Board } from '../../shared/board/board';
import { reviewSweep, type ReviewPorts, type ReviewSweep } from './review-flow';
import { intoReview } from './review';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { temporaryFolder } from '../testing/temporary-folder';

const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function folder(): string {
  return temporaryFolder('dashboard-review-');
}

// One card in Backlog. Another id gives a board that parses and has cards on it, none of them this card:
// the deleted card, as against the empty board that has lost every card at once.
function boardWithCard(pullRequest: number | null, id = CARD): Board {
  const board = emptyBoard();
  const withCard = {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
      : column)),
  };
  return pullRequest === null ? withCard : setPullRequest(withCard, { column: 0, card: 0 }, pullRequest).board;
}

// A project and the worktree beside it, each with a board of its own: the project's is what the sweep
// moves the card on, and the worktree's is what the agent wrote its pull request number into.
function flight(pullRequest: number | null): { entry: WorktreeEntry; projectPath: string } {
  const projectPath = folder();
  const worktreePath = folder();
  writeBoard(projectPath, boardWithCard(null));
  mkdirSync(join(worktreePath, BOARD_DIRECTORY), { recursive: true });
  writeBoard(worktreePath, boardWithCard(pullRequest));
  return {
    projectPath,
    entry: {
      cardId: CARD,
      title: 'Ship it',
      projectPath,
      branch: 'ship-it',
      worktreePath,
      pane: 3,
      startedAt: '2026-09-16T09:00:00.000Z',
      reviewing: false,
    },
  };
}

type Recorded = { removed: string[]; added: string[]; started: { slot: number; prompt: string }[] };

function ports(entry: WorktreeEntry, over: Partial<ReviewPorts> = {}): { ports: ReviewPorts; log: Recorded } {
  const log: Recorded = { removed: [], added: [], started: [] };
  return {
    log,
    ports: {
      worktrees: () => [entry],
      slotOf: () => 0,
      agentWorksIn: () => false,
      shellLivesIn: async () => false,
      removeWorktree: async (worktreePath) => {
        log.removed.push(worktreePath);
        return { ok: true, message: '', dirty: [] };
      },
      addWorktree: async (added) => { log.added.push(added.branch); },
      startReview: async (started, slot, prompt) => {
        log.started.push({ slot, prompt });
        return { ok: true, entry: started };
      },
      queue: (_key, run) => run(),
      writeBoard: (projectPath, board) => { writeBoard(projectPath, board); },
      arrived: async () => undefined,
      ...over,
    },
  };
}

// The sweep as main wires it with settings review.autoLoop on: a card noticed goes through card.move,
// whose table starts the review. card.move itself is tested in actions/card/move.test.ts.
function sweepWith(made: ReviewPorts): ReviewSweep {
  const sweep: ReviewSweep = reviewSweep({
    ...made,
    arrived: (entry) => sweep.review(entry.cardId),
  });
  return sweep;
}

function columnOfCard(projectPath: string): string {
  const board = readBoard(projectPath).board;
  return board.columns.find((column) => column.cards.some((card) => card.id === CARD))?.name ?? '';
}

function commentsOnCard(projectPath: string): string[] {
  const board = readBoard(projectPath).board;
  const card = board.columns.flatMap((column) => column.cards).find((entry) => entry.id === CARD);
  return (card?.comments ?? []).map((comment) => comment.body);
}

describe('reviewSweep', () => {
  it('moves the card into Review and swaps the worktree for one that reviews it', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.added).toEqual(['ship-it']);
    expect(log.started[0].prompt).toContain('/pr-loop 12');
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

  // The pull request number is the whole signal. Until it is there the agent is still working, and a
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

  // A review that ended the way it was meant to: the pull request merged and the card in Done. The
  // pull request number stays written on the branch's board, so the card's own column is the only
  // thing saying the review already happened — and once it has, the worktree has nothing left to do.
  it('removes the worktree of a card the review moved past Review, without reviewing it again', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    const { ports: made, log } = ports({ ...entry, reviewing: true });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.started).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Done');
  });

  // Cancelled is past Review on a board as shipped, but a cancelled card may be taken back up: its
  // worktree waits for the worktree dialog (board-decision-4).
  it('keeps the worktree of a cancelled card and starts no review for it', async () => {
    const { entry, projectPath } = flight(12);
    const board = boardWithCard(null);
    writeBoard(projectPath, moveCardById(board, CARD, columnNamed(board, CANCELLED_COLUMN)) ?? board);
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.removed).toEqual([]);
    expect(log.started).toEqual([]);
  });

  // The review agent moves the project's card to Done and then writes its summary. Taking the folder
  // then kills the shell mid-sentence.
  it('waits for the review agent to stop before removing a finished worktree', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    let working = true;
    const { ports: made, log } = ports({ ...entry, reviewing: true }, { agentWorksIn: () => working });
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    working = false;
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // The review is done and quiet, but its pane is still open: you may be typing a follow-up into it, or
  // have an editor open in the folder. Removing the worktree would kill that shell, so it waits until
  // the last one is closed, and then goes.
  it('keeps a finished worktree while a shell still stands in it', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    let open = true;
    const { ports: made, log } = ports({ ...entry, reviewing: true }, { shellLivesIn: async () => open });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([]);
    open = false;
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // `lsof` stuck longer than the five-second tick. The next run must not reach the same card and remove
  // the worktree a second time: git would refuse the second, and the card would say the worktree was
  // kept when it is already gone.
  it('removes a finished worktree once when a run starts before the last one has asked', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    let answer: (lives: boolean) => void = () => undefined;
    const asked = new Promise<boolean>((resolve) => { answer = resolve; });
    const { ports: made, log } = ports({ ...entry, reviewing: true }, { shellLivesIn: () => asked });
    const sweep = sweepWith(made);
    const first = sweep.run();
    const second = sweep.run();
    answer(false);
    await Promise.all([first, second]);
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // A card dragged to Done by hand before any pull request was opened. Nothing says the work landed,
  // so the folder is not the sweep's to throw away.
  it('keeps the worktree of a card in Done with no pull request', async () => {
    const { entry, projectPath } = flight(null);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    const { ports: made, log } = ports(entry);
    await sweepWith(made).run();
    expect(log.removed).toEqual([]);
  });

  // git refuses a worktree with anything uncommitted in it. The card says so once, and the sweep does
  // not ask git again every five seconds for an answer that will not change by itself.
  it('says once on the card why a finished worktree was kept', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
    const { ports: made, log } = ports(entry, {
      removeWorktree: async (worktreePath) => {
        log.removed.push(worktreePath);
        return { ok: false, message: '', dirty: ['draft.md'] };
      },
    });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
    const card = readBoard(projectPath).board.columns[5].cards[0];
    expect(card.comments?.map((comment) => comment.body)).toEqual([
      'Worktree kept: uncommitted changes in ship-it, remove it from the worktree list',
    ]);
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

  // The bug this was written for. `/work-card` writes the pull request number onto the branch's board
  // and commits it a moment later, and a tick landing between those two finds the number there and
  // board.json uncommitted. Marked for good, the pull request sits in Review with nobody reviewing it
  // until the app restarts — which is a card nobody notices for a day.
  it('tries a dirty worktree again on the next tick, and reviews it once the commit lands', async () => {
    const { entry, projectPath } = flight(12);
    let committed = false;
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => (committed
        ? { ok: true, message: '', dirty: [] }
        : { ok: false, message: '', dirty: ['.dashboard/board.json'] }),
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
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 5) ?? boardWithCard(null));
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
      .resolves.toEqual({ refused: '"Ship it" has no pull request on ship-it yet' });
    await expect(reviewSweep(ports(early.entry).ports).review('other'))
      .resolves.toEqual({ refused: 'card other has no worktree to review; ship it first' });
    const twice = flight(12);
    const sweep = reviewSweep(ports(twice.entry).ports);
    const first = sweep.review(CARD);
    await expect(sweep.review(CARD)).resolves.toEqual({ refused: '"Ship it" is already being reviewed' });
    await first;
  });
});
