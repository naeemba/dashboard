import { describe, expect, it } from 'vitest';
import { createBoardSaves } from './board-saves';
import { board, titles } from '../../shared/board/test-board';
import { moveCardToColumn, renameCard, selectionOf } from '../../shared/board/board';
import { rebaseBoardChange, sameBoard } from '../../shared/board/board-merge';
import type { Board } from '../../shared/board/board';

type Call = { base: Board; board: Board; settle(result: Board | null | Error): void };

function recording() {
  const calls: Call[] = [];
  const write = (base: Board, next: Board) => new Promise<Board | null>((resolve, reject) => {
    calls.push({ base, board: next, settle: (result) => (result instanceof Error ? reject(result) : resolve(result)) });
  });
  return { calls, write };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createBoardSaves', () => {
  const first = board(['a']);
  const second = board(['b']);
  const third = board(['c']);

  it('sends the board the last save wrote as the next base', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const one = saves.save(second);
    await tick();
    calls[0].settle(null);
    await one;
    void saves.save(third);
    await tick();
    expect(calls[1].base).toBe(second);
  });

  it('sends the board it sent as the next base even when main kept a change', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const one = saves.save(second);
    await tick();
    calls[0].settle(board(['merged']));
    await one;
    void saves.save(third);
    await tick();
    expect(calls[1].base).toBe(second);
  });

  // The agent's move lands between the screen's read and its saves; two saves go out before the re-read.
  it('keeps a move the command made across two saves sent before the re-read', async () => {
    const start = board(['a', 'b'], [], []);
    let disk = moveCardToColumn(start, selectionOf(start, 'b')!, 2).board;
    const saves = createBoardSaves(async (base, next) => {
      const written = rebaseBoardChange(base, next, disk);
      disk = written;
      return sameBoard(written, next) ? null : written;
    }, start);
    const renamed = renameCard(start, selectionOf(start, 'a')!, 'renamed').board;
    const again = renameCard(renamed, selectionOf(renamed, 'a')!, 'renamed again').board;
    void saves.save(renamed);
    await saves.save(again);
    expect(titles(disk)).toEqual([['renamed again'], [], ['b']]);
  });

  // The re-read after the first rename lands while the second rename is out.
  it('keeps a read that landed while a save was out as the next base', async () => {
    const start = board(['a', 'b'], [], []);
    let disk = moveCardToColumn(start, selectionOf(start, 'b')!, 2).board;
    const answers: (() => void)[] = [];
    const saves = createBoardSaves((base, next) => {
      const written = rebaseBoardChange(base, next, disk);
      disk = written;
      return new Promise((resolve) => answers.push(() => resolve(sameBoard(written, next) ? null : written)));
    }, start);
    const once = renameCard(start, selectionOf(start, 'a')!, 'r0').board;
    const twice = renameCard(once, selectionOf(once, 'a')!, 'r1').board;
    void saves.save(once);
    void saves.save(twice);
    await tick();
    const reread = disk;
    answers[0]();
    await tick();
    expect(titles(reread)).toEqual([['r0'], [], ['b']]);
    expect(answers).toHaveLength(2);
    saves.read(reread);
    answers[1]();
    await tick();
    const renamed = renameCard(reread, selectionOf(reread, 'b')!, 'bb').board;
    const last = saves.save(renamed);
    await tick();
    answers[2]();
    await last;
    expect(titles(disk)).toEqual([['r1'], [], ['bb']]);
  });

  it('keeps the base of a failed save, so the next one carries its change', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const one = saves.save(second);
    await tick();
    calls[0].settle(new Error('EBUSY'));
    await expect(one).rejects.toThrow('EBUSY');
    void saves.save(third);
    await tick();
    expect(calls[1].base).toBe(first);
  });

  it('holds a save back until the one before it has failed, then sends the older base', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const one = saves.save(second);
    void saves.save(third);
    await tick();
    expect(calls).toHaveLength(1);
    calls[0].settle(new Error('EBUSY'));
    await expect(one).rejects.toThrow('EBUSY');
    await tick();
    expect(calls[1]).toMatchObject({ base: first, board: third });
  });

  it('sends the board last read as the base', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    saves.read(second);
    void saves.save(third);
    await tick();
    expect(calls[0].base).toBe(second);
  });

  // A read taken while a save waits behind another is older than the file once that save goes out.
  it('says a save went out since a mark only once one was sent to main', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const one = saves.save(second);
    void saves.save(third);
    await tick();
    const mark = saves.mark();
    expect(saves.sentSince(mark)).toBe(false);
    calls[0].settle(null);
    await one;
    await tick();
    expect(calls).toHaveLength(2);
    expect(saves.sentSince(mark)).toBe(true);
  });
});
