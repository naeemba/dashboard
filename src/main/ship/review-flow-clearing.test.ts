import { describe, expect, it } from 'vitest';
import { readBoard, writeBoard } from '../board/board-store';
import { CANCELLED_COLUMN, columnNamed, moveCardById } from '../../shared/board/board';
import { CARD, boardWithCard, columnOfCard, flight, inDone, ports, sweepWith } from './review-flow-fixture';

// The review sweep's other half: a card past Review has its worktree removed, once nothing stands in
// it, and kept, with the card saying why, when git refuses.
describe('reviewSweep clearing a finished worktree', () => {
  // A review that ended the way it was meant to: the pull request merged and the card in Done, still
  // carrying its number, and the worktree carrying the same one from a base card.follow's board commit
  // came in with. The card's own column is the only thing saying the review already happened — and once
  // it has, the worktree has nothing left to do.
  it('removes the worktree of a card the review moved past Review, without reviewing it again', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, inDone(12));
    const { ports: made, log } = ports({ ...entry, reviewing: true });
    const sweep = sweepWith(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.started).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Done');
  });

  // The whole run in one sitting: the sweep starts the review, the review merges, the card reaches
  // Done. The mark the start put on must not keep the sweep from the Done card's worktree until a
  // restart, which is how every reviewed card's folder stayed on disk for the rest of the run.
  it('removes the worktree of a card it reviewed once the card reaches Done in the same run', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry);
    const sweep = sweepWith(made);
    await sweep.run();
    expect(log.started).toHaveLength(1);
    writeBoard(projectPath, inDone(12));
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath, entry.worktreePath]);
  });

  // The usual case: nothing on the worktree's board, only the number card.follow put on the card.
  it('removes the worktree of a card in Done whose worktree board has no number', async () => {
    const { entry, projectPath } = flight(null);
    writeBoard(projectPath, inDone(15));
    const { ports: made, log } = ports({ ...entry, reviewing: true });
    await sweepWith(made).run();
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.started).toEqual([]);
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

  // The review agent is still writing its summary when the card reaches Done. Taking the folder then
  // kills the shell mid-sentence.
  it('waits for the review agent to stop before removing a finished worktree', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, inDone(12));
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
    writeBoard(projectPath, inDone(12));
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
    writeBoard(projectPath, inDone(12));
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
    writeBoard(projectPath, inDone(12));
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
});
