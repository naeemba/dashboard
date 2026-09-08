import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITY, type Board, type Card } from './board';
import { cardMeta } from './board-detail';

const now = Date.parse('2026-09-08T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function card(fields: Partial<Card> = {}): Card {
  return { id: 'x', title: 'Ship it', notes: '', priority: DEFAULT_PRIORITY, parent: null, ...fields };
}

function board(...cards: Card[]): Board {
  return { columns: [{ name: 'Todo', cards }] };
}

function ago(days: number): string {
  return new Date(now - days * DAY).toISOString();
}

describe('cardMeta', () => {
  it('says the priority on a card that carries nothing else', () => {
    expect(cardMeta(board(card()), card(), now)).toBe('medium');
  });

  it('names the parent, the branch and the pull request', () => {
    const parent = card({ id: 'p', title: 'The manager page' });
    const child = card({ parent: 'p', branch: 'fix-the-picker', pullRequest: 14 });
    expect(cardMeta(board(parent, child), child, now))
      .toBe('medium · subtask of The manager page · fix-the-picker · #14');
  });

  it('ages the card both ways when it has been touched since it was written', () => {
    const touched = card({ createdAt: ago(30), updatedAt: ago(2) });
    expect(cardMeta(board(touched), touched, now)).toBe('medium · added last month · edited 2 days ago');
  });

  // Otherwise every card that has only ever been written says the same thing twice.
  it('says only when it was added while nothing has changed since', () => {
    const fresh = card({ createdAt: ago(3), updatedAt: ago(3) });
    expect(cardMeta(board(fresh), fresh, now)).toBe('medium · added 3 days ago');
  });

  // A board written before timestamps existed, and a hand-typed date the clock cannot read.
  it('says nothing about dates it does not have or cannot read', () => {
    expect(cardMeta(board(card()), card(), now)).toBe('medium');
    const guessed = card({ createdAt: 'last tuesday' });
    expect(cardMeta(board(guessed), guessed, now)).toBe('medium');
  });
});
