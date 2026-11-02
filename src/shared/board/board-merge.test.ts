import { describe, expect, it } from 'vitest';
import { addCard, addComment, deleteCard, renameCard, selectionOf, setBranch, type Board } from './board';
import { rebaseBoardChange, sameBoard } from './board-merge';
import { board, titles } from './test-board';

// A card moved by hand, the way the command does it: out of wherever it is, onto the bottom of a column.
function moved(from: Board, id: string, column: number): Board {
  const card = from.columns.flatMap((entry) => entry.cards).find((entry) => entry.id === id);
  if (!card) throw new Error(`no card ${id}`);
  return {
    columns: from.columns.map((entry, index) => ({
      ...entry,
      cards: [...entry.cards.filter((other) => other.id !== id), ...(index === column ? [card] : [])],
    })),
  };
}

function at(on: Board, id: string) {
  const selection = selectionOf(on, id);
  if (!selection) throw new Error(`no card ${id}`);
  return selection;
}

describe('rebaseBoardChange', () => {
  it('writes the screen board as it is when nothing else touched the file', () => {
    const base = board(['a', 'b'], []);
    const next = renameCard(base, at(base, 'a'), 'renamed').board;
    expect(rebaseBoardChange(base, next, base)).toBe(next);
  });

  // The lost move: an agent moves its card, the app renames another from the board it read before.
  it('keeps a move the command made while the screen renamed another card', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'b', 2);
    const next = renameCard(base, at(base, 'a'), 'renamed').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['renamed'], [], ['b']]);
  });

  it('keeps a branch the command set on the card the screen renamed', () => {
    const base = board(['a']);
    const latest = setBranch(base, at(base, 'a'), 'work').board;
    const next = renameCard(base, at(base, 'a'), 'renamed').board;
    expect(rebaseBoardChange(base, next, latest).columns[0].cards[0]).toMatchObject({ title: 'renamed', branch: 'work' });
  });

  it('keeps both comments when the command and the screen each add one', () => {
    const base = board(['a']);
    const latest = addComment(base, at(base, 'a'), 'from the agent').board;
    const next = addComment(base, at(base, 'a'), 'from the screen').board;
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
    const next = deleteCard(added, at(added, 'b')).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([[], ['new', 'a']]);
  });

  it('leaves a card deleted on disk deleted even though the screen edited it', () => {
    const base = board(['a', 'b']);
    const latest = deleteCard(base, at(base, 'b')).board;
    const next = renameCard(base, at(base, 'b'), 'renamed').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['a']]);
  });
});

describe('sameBoard', () => {
  it('compares boards as the file would hold them', () => {
    expect(sameBoard(board(['a']), board(['a']))).toBe(true);
    expect(sameBoard(board(['a']), board(['b']))).toBe(false);
  });
});
