import { describe, expect, it } from 'vitest';
import type { Board } from './board';
import { createCardAim } from './card-aim';

const board: Board = {
  columns: [
    { name: 'Todo', cards: [] },
    { name: 'Review', cards: [{ id: 'a', title: 'A', notes: '', priority: 'medium', parent: null }] },
  ],
};

describe('createCardAim', () => {
  it('lands the next arrival on the aimed card, and only that one', () => {
    const aim = createCardAim();
    aim.aimAt('a');
    expect(aim.spend(board)).toEqual({ column: 1, card: 0 });
    expect(aim.spend(board)).toBeNull();
  });

  it('is spent even when the aimed card has gone', () => {
    const aim = createCardAim();
    aim.aimAt('gone');
    expect(aim.spend(board)).toBeNull();
    expect(aim.spend(board)).toBeNull();
  });

  it('lands nowhere when nothing was aimed', () => {
    expect(createCardAim().spend(board)).toBeNull();
  });
});
