import { describe, expect, it, vi } from 'vitest';
import { emptyBoard, type Board } from './board';
import type { BoardRead } from './board-store';
import { BOARD_STALE_MS, DIRTY_STALE_MS, createManagerReads, isStale } from './manager-reads';

// A read that settles only when the test says so, so the order things land in is the test's to pick.
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const named = (name: string): Board => ({ columns: [{ name, cards: [] }] });

function harness() {
  let now = 1_000;
  const boardReads: { path: string; answer: ReturnType<typeof deferred<BoardRead>> }[] = [];
  const dirtyChecks: ReturnType<typeof deferred<{ dirty: string[]; unreadable: string[] }>>[] = [];
  const onRead = vi.fn();
  const reads = createManagerReads({
    readBoard(path) {
      const answer = deferred<BoardRead>();
      boardReads.push({ path, answer });
      return answer.promise;
    },
    dirtyWorktrees() {
      const answer = deferred<{ dirty: string[]; unreadable: string[] }>();
      dirtyChecks.push(answer);
      return answer.promise;
    },
    onRead,
    now: () => now,
  });
  return { reads, boardReads, dirtyChecks, onRead, advance: (by: number) => { now += by; } };
}

describe('isStale', () => {
  it('asks for what was never read, and for what is old', () => {
    expect(isStale(undefined, 10, 5)).toBe(true);
    expect(isStale(0, 5, 5)).toBe(true);
    expect(isStale(1, 5, 5)).toBe(false);
  });
});

describe('createManagerReads', () => {
  it('reads each project once, and not again until the answer is old', async () => {
    const { reads, boardReads, advance } = harness();
    reads.refresh(['/api'], []);
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(1);
    boardReads[0].answer.resolve({ board: named('Todo'), brokenFile: null });
    await settle();
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(1);
    advance(BOARD_STALE_MS);
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(2);
  });

  it('draws again when an answer lands', async () => {
    const { reads, boardReads, onRead } = harness();
    reads.refresh(['/api'], []);
    boardReads[0].answer.resolve({ board: named('Todo'), brokenFile: null });
    await settle();
    expect(onRead).toHaveBeenCalled();
    expect(reads.boardOf('/api')).toEqual(named('Todo'));
  });

  // A broken file reads back as an empty board. Counting that would say the project has nothing on it.
  it('keeps the last good board when the file will not parse', async () => {
    const { reads, boardReads, advance } = harness();
    reads.refresh(['/api'], []);
    boardReads[0].answer.resolve({ board: named('Todo'), brokenFile: null });
    await settle();
    advance(BOARD_STALE_MS);
    reads.refresh(['/api'], []);
    boardReads[1].answer.resolve({ board: emptyBoard(), brokenFile: '/api/.dashboard/board.json.broken' });
    await settle();
    expect(reads.boardOf('/api')).toEqual(named('Todo'));
  });

  // The change may have landed after the running read took the file, so one more read follows it.
  it('reads again after a change reported while a read was running', async () => {
    const { reads, boardReads } = harness();
    reads.refresh(['/api'], []);
    reads.boardChanged('/api');
    expect(boardReads).toHaveLength(1);
    boardReads[0].answer.resolve({ board: named('Old'), brokenFile: null });
    await settle();
    expect(boardReads).toHaveLength(2);
    boardReads[1].answer.resolve({ board: named('New'), brokenFile: null });
    await settle();
    expect(reads.boardOf('/api')).toEqual(named('New'));
  });

  it('ignores a change to a board it is not showing', () => {
    const { reads, boardReads } = harness();
    reads.boardChanged('/elsewhere');
    expect(boardReads).toHaveLength(0);
  });

  it('drops the board of a project that closed', async () => {
    const { reads, boardReads } = harness();
    reads.refresh(['/api'], []);
    boardReads[0].answer.resolve({ board: named('Todo'), brokenFile: null });
    await settle();
    reads.refresh([], []);
    expect(reads.boardOf('/api')).toBeUndefined();
  });

  it('checks the worktrees again when one appears, without waiting for the old answer to age', async () => {
    const { reads, dirtyChecks } = harness();
    reads.refresh([], ['/api.worktrees/a']);
    dirtyChecks[0].resolve({ dirty: ['/api.worktrees/a'], unreadable: [] });
    await settle();
    expect(reads.dirtiness().dirty.has('/api.worktrees/a')).toBe(true);
    reads.refresh([], ['/api.worktrees/a']);
    expect(dirtyChecks).toHaveLength(1);
    reads.refresh([], ['/api.worktrees/a', '/api.worktrees/b']);
    expect(dirtyChecks).toHaveLength(2);
  });

  it('checks again once the answer is old, or once a removal made it so', async () => {
    const { reads, dirtyChecks, advance } = harness();
    reads.refresh([], ['/w']);
    dirtyChecks[0].resolve({ dirty: [], unreadable: [] });
    await settle();
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    expect(dirtyChecks).toHaveLength(2);
    dirtyChecks[1].resolve({ dirty: [], unreadable: [] });
    await settle();
    reads.forgetDirtiness();
    reads.refresh([], ['/w']);
    expect(dirtyChecks).toHaveLength(3);
  });

  // Keeping the old answer would call a worktree clean that nobody has looked at since.
  it('says nothing is known after a check that failed', async () => {
    const { reads, dirtyChecks, advance } = harness();
    reads.refresh([], ['/w']);
    dirtyChecks[0].resolve({ dirty: ['/w'], unreadable: [] });
    await settle();
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    dirtyChecks[1].reject(new Error('git gone'));
    await settle();
    expect(reads.dirtiness().checked).toBe(false);
  });
});
