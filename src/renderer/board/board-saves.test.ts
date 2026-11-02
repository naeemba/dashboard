import { describe, expect, it } from 'vitest';
import { createBoardSaves } from './board-saves';
import { board } from '../../shared/board/test-board';
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

  it('sends the board main wrote as the next base when it kept a change', async () => {
    const { calls, write } = recording();
    const saves = createBoardSaves(write, first);
    const merged = board(['merged']);
    const one = saves.save(second);
    await tick();
    calls[0].settle(merged);
    await one;
    void saves.save(third);
    await tick();
    expect(calls[1].base).toBe(merged);
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
});
