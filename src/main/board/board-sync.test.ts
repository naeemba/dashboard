import { describe, expect, it } from 'vitest';
import { addCard, deleteCard, emptyBoard, moveCardToColumn, renameCard, selectionOf } from '../../shared/board/board';
import { checkoutStep, publishesCheckout, syncCommitMessage, type CheckoutState } from './board-sync';

const behind: CheckoutState = { branch: 'main', defaultBranch: 'main', current: false, behind: true, porcelain: '' };

describe('checkoutStep', () => {
  it('fast-forwards a checkout on main that is only behind', () => {
    expect(checkoutStep(behind)).toBe('fast-forward');
  });

  // The app's own writes are the board's files; they are what the fast-forward puts back on top.
  it('fast-forwards over changes inside .dashboard/', () => {
    expect(checkoutStep({ ...behind, porcelain: ' M .dashboard/board/cards/a.json\n?? .dashboard/board/cards/b.json' })).toBe('fast-forward');
  });

  it('leaves a checkout with work outside .dashboard/', () => {
    expect(checkoutStep({ ...behind, porcelain: ' M src/main.ts' })).toEqual({ stay: 'it has changes outside .dashboard/' });
  });

  it('leaves a checkout on another branch, or detached', () => {
    expect(checkoutStep({ ...behind, branch: 'feature' })).toEqual({ stay: 'it is not on main' });
    expect(checkoutStep({ ...behind, branch: null })).toEqual({ stay: 'it is not on main' });
  });

  it('leaves a checkout with commits origin does not have', () => {
    expect(checkoutStep({ ...behind, behind: false })).toEqual({ stay: 'it has commits main on origin does not' });
  });

  it('calls a checkout at the tip current, dirty board or not', () => {
    expect(checkoutStep({ ...behind, current: true, porcelain: ' M src/main.ts' })).toBe('current');
  });
});

describe('publishesCheckout', () => {
  it('publishes the checkout board only from the default branch', () => {
    expect(publishesCheckout('main', 'main')).toBe(true);
    expect(publishesCheckout('feature', 'main')).toBe(false);
    expect(publishesCheckout(null, 'main')).toBe(false);
  });
});

describe('syncCommitMessage', () => {
  const before = addCard(addCard(emptyBoard(), { column: 1, card: 0 }, 'a', 'Fix login').board, { column: 1, card: 0 }, 'b', 'Add search').board;

  it('names the moves', () => {
    const after = moveCardToColumn(before, selectionOf(before, 'a')!, 2).board;
    expect(syncCommitMessage(before, after)).toBe(`board: "Fix login" ${before.columns[1].name} → ${before.columns[2].name}`);
  });

  it('names the one card changed or removed, and counts more', () => {
    const renamed = renameCard(before, selectionOf(before, 'a')!, 'Fix the login').board;
    expect(syncCommitMessage(before, renamed)).toBe('board: update "Fix the login"');
    expect(syncCommitMessage(before, deleteCard(before, selectionOf(before, 'b')!).board)).toBe('board: remove "Add search"');
    const both = renameCard(renamed, selectionOf(renamed, 'b')!, 'Add a search').board;
    expect(syncCommitMessage(before, both)).toBe('board: update 2 cards');
  });
});
