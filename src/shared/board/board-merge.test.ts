import { describe, expect, it } from 'vitest';
import { addCard, addComment, deleteCard, dropCard, moveCardToColumn, renameCard, selectionOf, setBranch, type Board } from './board';
import { rebaseBoardChange, sameBoard } from './board-merge';
import { board, titles } from './test-board';

function moved(from: Board, id: string, column: number): Board {
  return moveCardToColumn(from, selectionOf(from, id)!, column).board;
}

describe('rebaseBoardChange', () => {
  it('writes the screen board as it is when nothing else touched the file', () => {
    const base = board(['a', 'b'], []);
    const next = renameCard(base, selectionOf(base, 'a')!, 'renamed').board;
    expect(rebaseBoardChange(base, next, base)).toBe(next);
  });

  it('writes the screen board as it is when the file is gone or will not parse', () => {
    const base = board(['a']);
    const next = renameCard(base, selectionOf(base, 'a')!, 'renamed').board;
    expect(rebaseBoardChange(base, next, null)).toBe(next);
  });

  // The lost move: an agent moves its card, the app renames another from the board it read before.
  it('keeps a move the command made while the screen renamed another card', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'b', 2);
    const next = renameCard(base, selectionOf(base, 'a')!, 'renamed').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['renamed'], [], ['b']]);
  });

  it('keeps a branch the command set on the card the screen renamed', () => {
    const base = board(['a']);
    const latest = setBranch(base, selectionOf(base, 'a')!, 'work').board;
    const next = renameCard(base, selectionOf(base, 'a')!, 'renamed').board;
    expect(rebaseBoardChange(base, next, latest).columns[0].cards[0]).toMatchObject({ title: 'renamed', branch: 'work' });
  });

  it('keeps both comments when the command and the screen each add one', () => {
    const base = board(['a']);
    const latest = addComment(base, selectionOf(base, 'a')!, 'from the agent').board;
    const next = addComment(base, selectionOf(base, 'a')!, 'from the screen').board;
    const bodies = rebaseBoardChange(base, next, latest).columns[0].cards[0].comments?.map((comment) => comment.body);
    expect(bodies).toEqual(['from the agent', 'from the screen']);
  });

  it('moves the card the screen moved under the card it was dropped below, keeping the one the command added', () => {
    const base = board(['a', 'b'], ['c']);
    const latest = addCard(base, { column: 1, card: 0 }, 'agent', 'agent').board;
    const next = moved(base, 'a', 1);
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['b'], ['c', 'a', 'agent']]);
  });

  it('adds and deletes what the screen added and deleted', () => {
    const base = board(['a', 'b'], []);
    const latest = moved(base, 'a', 1);
    const added = addCard(base, { column: 1, card: 0 }, 'new', 'new').board;
    const next = deleteCard(added, selectionOf(added, 'b')!).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([[], ['new', 'a']]);
  });

  it('leaves a card deleted on disk deleted even though the screen edited it', () => {
    const base = board(['a', 'b']);
    const latest = deleteCard(base, selectionOf(base, 'b')!).board;
    const next = renameCard(base, selectionOf(base, 'b')!, 'renamed').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['a']]);
  });

  // The card above the agent's changed, not the agent's card: that is no move of the agent's card.
  it('keeps a move the command made while the screen deleted the card above it', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'b', 2);
    const next = deleteCard(base, selectionOf(base, 'a')!).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([[], [], ['b']]);
  });

  it('keeps a move the command made while the screen moved the card above it', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'b', 2);
    expect(titles(rebaseBoardChange(base, moved(base, 'a', 1), latest))).toEqual([[], ['a'], ['b']]);
  });

  it('keeps a move the command made while the screen added a card above it', () => {
    const base = board(['a', 'b'], ['c'], []);
    const latest = moved(base, 'b', 2);
    const next = dropCard(base, selectionOf(base, 'c')!, 0, 1).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['a', 'c'], [], ['b']]);
  });

  // The dropped card goes beside its neighbours in the screen's column, not beside one the agent took away.
  it('places a dropped card among the cards still in its column', () => {
    const base = board(['x', 'a', 'b'], ['c'], []);
    const latest = moved(base, 'a', 2);
    const next = dropCard(base, selectionOf(base, 'c')!, 0, 2).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['x', 'c', 'b'], [], ['a']]);
  });
});

describe('sameBoard', () => {
  it('compares boards as the file would hold them', () => {
    expect(sameBoard(board(['a']), board(['a']))).toBe(true);
    expect(sameBoard(board(['a']), board(['b']))).toBe(false);
  });
});
