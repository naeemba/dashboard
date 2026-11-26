import { describe, expect, it } from 'vitest';
import { addCard, deleteCard, emptyBoard, moveCardToColumn, renameCard, selectionOf } from '../../shared/board/board';
import { checkoutStep, damagedBoardRefusal, droppedConnection, droppedPushReason, lostRace, notSyncedRefusal, publishesCheckout, RETRY_PAUSE, retryAfter, SYNC_ATTEMPTS, syncCommitMessage, type CheckoutState } from './board-sync';

const behind: CheckoutState = { branch: 'main', defaultBranch: 'main', current: false, behind: true, porcelain: '' };

describe('checkoutStep', () => {
  it('fast-forwards a checkout on main that is only behind', () => {
    expect(checkoutStep(behind)).toBe('fast-forward');
  });

  // The app's own writes are the board's files; they are what the fast-forward puts back on top.
  it('fast-forwards over changes inside .dashboard/', () => {
    expect(checkoutStep({ ...behind, porcelain: ' M .dashboard/board/cards/a.json\n?? .dashboard/board/cards/b.json' })).toBe('fast-forward');
  });

  it('fast-forwards over an untracked file outside .dashboard/', () => {
    expect(checkoutStep({ ...behind, porcelain: '?? .claude/\n M .dashboard/board/cards/a.json' })).toBe('fast-forward');
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

  it('says the docs were rewritten when no card changed, and names the cards when one did', () => {
    expect(syncCommitMessage(before, before, true)).toBe('board: rewrite the .dashboard docs to the current text');
    const renamed = renameCard(before, selectionOf(before, 'a')!, 'Fix the login').board;
    expect(syncCommitMessage(before, renamed, true)).toBe('board: update "Fix the login"');
  });

  it('names the one card changed or removed, and counts more', () => {
    const renamed = renameCard(before, selectionOf(before, 'a')!, 'Fix the login').board;
    expect(syncCommitMessage(before, renamed)).toBe('board: update "Fix the login"');
    expect(syncCommitMessage(before, deleteCard(before, selectionOf(before, 'b')!).board)).toBe('board: remove "Add search"');
    const both = renameCard(renamed, selectionOf(renamed, 'b')!, 'Add a search').board;
    expect(syncCommitMessage(before, both)).toBe('board: update 2 cards');
  });

  it('says the columns changed when no card did', () => {
    expect(syncCommitMessage(before, { columns: [...before.columns, { name: 'Later', cards: [] }] })).toBe('board: update the columns');
  });
});

describe('lostRace', () => {
  it('retries only the rejections a fresh fetch fixes', () => {
    expect(lostRace(' ! [rejected]        HEAD -> main (fetch first)')).toBe(true);
    expect(lostRace(' ! [rejected]        HEAD -> main (non-fast-forward)')).toBe(true);
    expect(lostRace(' ! [remote rejected] HEAD -> main (incorrect old value provided)')).toBe(true);
    expect(lostRace("remote: error: cannot lock ref 'refs/heads/main': is at 1a2b3c but expected 4d5e6f")).toBe(true);
    expect(lostRace(' ! [remote rejected] HEAD -> main (pre-receive hook declined)')).toBe(false);
    expect(lostRace('remote: error: GH006: Protected branch update failed for refs/heads/main.')).toBe(false);
  });
});

describe('damagedBoardRefusal', () => {
  it('refuses only when a board file does not parse, and names it', () => {
    expect(damagedBoardRefusal([])).toBeNull();
    expect(damagedBoardRefusal(['.dashboard/board/cards/a.json'])).toContain('(.dashboard/board/cards/a.json)');
  });
});

describe('retryAfter', () => {
  const dropped = 'Connection closed by 20.26.156.215 port 22\r\nfatal: Could not read from remote repository.';

  it('tries a dropped connection again a pause later, on the fetch or the push, until the last attempt', () => {
    expect(droppedConnection(dropped)).toBe(true);
    expect(retryAfter(1, dropped, false)).toBe(RETRY_PAUSE);
    expect(retryAfter(SYNC_ATTEMPTS - 1, dropped, true)).toBe(RETRY_PAUSE);
    expect(retryAfter(SYNC_ATTEMPTS, dropped, false)).toBeNull();
  });

  it('tries a push that lost a race again at once, and never a fetch on those words', () => {
    expect(retryAfter(1, ' ! [rejected] main -> main (fetch first)', true)).toBe(0);
    expect(retryAfter(1, ' ! [rejected] main -> main (fetch first)', false)).toBeNull();
  });

  it('gives up at once on a failure that would fail the same way again', () => {
    expect(retryAfter(1, "fatal: '/gone/missing.git' does not appear to be a git repository", false)).toBeNull();
    expect(retryAfter(1, 'git@github.com: Permission denied (publickey).', false)).toBeNull();
    expect(retryAfter(1, 'ssh: Could not resolve hostname github.com', false)).toBeNull();
  });
});

describe('notSyncedRefusal', () => {
  it('refuses a change in a worktree, naming why origin did not take it', () => {
    expect(notSyncedRefusal(true, true, 'cannot fetch origin/main: Connection closed')).toMatch(/^board not changed: cannot fetch origin\/main: Connection closed\./);
  });

  it('says to run it again only when the connection dropped', () => {
    expect(notSyncedRefusal(true, true, 'cannot fetch origin/main: Connection closed')).toMatch(/run the command again/);
    expect(notSyncedRefusal(true, true, 'the push to origin/main was refused: GH006: Protected branch update failed')).not.toMatch(/again/);
    const dropped = notSyncedRefusal(true, true, droppedPushReason('origin/main', 'Connection closed by 140.82.121.4 port 22'));
    expect(dropped).toMatch(/may have landed/);
    expect(dropped).toMatch(/board show <id>/);
    expect(dropped).not.toMatch(/once origin answers/);
  });

  it('ends the reason with one full stop', () => {
    expect(notSyncedRefusal(true, true, 'the repository exists.')).toMatch(/exists\. Nothing/);
  });

  it('lets a read through in a worktree', () => {
    expect(notSyncedRefusal(true, false, 'offline')).toBeNull();
  });

  it('lets the project\'s checkout write the change where it is', () => {
    expect(notSyncedRefusal(false, true, 'offline')).toBeNull();
  });
});
