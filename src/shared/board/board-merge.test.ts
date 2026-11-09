import { describe, expect, it } from 'vitest';
import { addCard, addComment, deleteCard, dropCard, moveCard, moveCardToColumn, renameCard, selectionOf, setBranch, type Board, type Card } from './board';
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

  // A reorder in the screen's column is no move of the card the agent took out of it.
  it('keeps a move the command made while the screen moved another card up past it', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'a', 2);
    const next = moveCard(base, selectionOf(base, 'b')!, 'up').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['b'], [], ['a']]);
  });

  it('keeps a move the command made while the screen moved it down past another card', () => {
    const base = board(['a', 'b'], [], []);
    const latest = moved(base, 'b', 2);
    const next = moveCard(base, selectionOf(base, 'a')!, 'down').board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['a'], [], ['b']]);
  });

  // The dropped card goes beside its neighbours in the screen's column, not beside one the agent took away.
  it('places a dropped card among the cards still in its column', () => {
    const base = board(['x', 'a', 'b'], ['c'], []);
    const latest = moved(base, 'a', 2);
    const next = dropCard(base, selectionOf(base, 'c')!, 0, 2).board;
    expect(titles(rebaseBoardChange(base, next, latest))).toEqual([['x', 'c', 'b'], [], ['a']]);
  });
});

// A card with its dates set by hand, so which side is newer is the test's to say.
function dated(from: Board, id: string, updatedAt: string, fields: Partial<Card> = {}): Board {
  return {
    columns: from.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => (card.id === id ? { ...card, ...fields, updatedAt } : card)),
    })),
  };
}

function placed(from: Board, id: string, column: number, updatedAt: string, fields: Partial<Card> = {}): Board {
  return dated(moved(from, id, column), id, updatedAt, fields);
}

describe('rebaseBoardChange when both sides changed one card', () => {
  // Card 78442317: a checkout's stale copy said Review with a merge-refused comment, written after
  // origin had been told Done for a pull request still open. The newer word is the checkout's.
  it('keeps the newer move and both trails, and a field only one side set', () => {
    const base = board(['a'], [], []);
    const local = placed(base, 'a', 1, '2026-11-09T12:00:00.000Z', { comments: [{ at: '2026-11-09T12:00:00.000Z', body: 'merge refused' }] });
    const origin = placed(base, 'a', 2, '2026-11-09T11:00:00.000Z', { pullRequest: 19, comments: [{ at: '2026-11-09T10:00:00.000Z', body: 'opened #19' }] });
    const merged = rebaseBoardChange(base, local, origin);
    expect(titles(merged)).toEqual([[], ['a'], []]);
    expect(merged.columns[1].cards[0]).toMatchObject({ pullRequest: 19, updatedAt: '2026-11-09T12:00:00.000Z' });
    expect(merged.columns[1].cards[0].comments?.map((comment) => comment.body)).toEqual(['opened #19', 'merge refused']);
  });

  // The kamandsystem loss: a copy 19 commits old moved a card, and origin had moved it since.
  it('leaves the card where the newer side put it', () => {
    const base = board(['a'], [], []);
    const local = placed(base, 'a', 1, '2026-11-09T10:00:00.000Z', { title: 'renamed' });
    const origin = placed(base, 'a', 2, '2026-11-09T11:00:00.000Z', { title: 'origin title', branch: 'work' });
    const card = rebaseBoardChange(base, local, origin);
    expect(titles(card)).toEqual([[], [], ['origin title']]);
    expect(card.columns[2].cards[0]).toMatchObject({ branch: 'work', updatedAt: '2026-11-09T11:00:00.000Z' });
  });

  it('takes a field only the older side changed', () => {
    const base = board(['a']);
    const local = dated(base, 'a', '2026-11-09T10:00:00.000Z', { notes: 'from the checkout' });
    const origin = dated(base, 'a', '2026-11-09T11:00:00.000Z', { title: 'from origin' });
    expect(rebaseBoardChange(base, local, origin).columns[0].cards[0]).toMatchObject({ title: 'from origin', notes: 'from the checkout' });
  });

  it('adds a comment once when the disk already has it', () => {
    const base = board(['a']);
    const comment = { at: '2026-11-09T10:00:00.000Z', body: 'pushed already' };
    const local = dated(base, 'a', '2026-11-09T10:00:00.000Z', { comments: [comment] });
    expect(rebaseBoardChange(base, local, local).columns[0].cards[0].comments).toEqual([comment]);
    const origin = dated(local, 'a', '2026-11-09T11:00:00.000Z', { comments: [comment, { at: '2026-11-09T11:00:00.000Z', body: 'later' }] });
    expect(rebaseBoardChange(base, local, origin).columns[0].cards[0].comments?.map((entry) => entry.body)).toEqual(['pushed already', 'later']);
  });
});

describe('sameBoard', () => {
  it('compares boards as the file would hold them', () => {
    expect(sameBoard(board(['a']), board(['a']))).toBe(true);
    expect(sameBoard(board(['a']), board(['b']))).toBe(false);
  });
});
