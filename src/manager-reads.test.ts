import { describe, expect, it, vi } from 'vitest';
import type { Board } from './board';
import type { ScannedWorktree } from './git-worktrees';
import { BOARD_STALE_MS, DIRTY_STALE_MS, createManagerReads, sameDirtiness } from './manager-reads';
import { isStale } from './stale';

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

// A scan's answer: these worktrees of /api, the first list dirty, the second clean and the third
// unreadable.
const scan = (dirty: string[], clean: string[] = [], unreadable: string[] = []): ScannedWorktree[] => [
  ...dirty.map((path) => ({ path, dirty: true, unreadable: false })),
  ...clean.map((path) => ({ path, dirty: false, unreadable: false })),
  ...unreadable.map((path) => ({ path, dirty: false, unreadable: true })),
].map(({ path, ...state }) => ({ projectPath: '/api', worktreePath: path, branch: 'b', bytes: null, ...state }));

function harness() {
  let now = 1_000;
  const boardReads: { path: string; answer: ReturnType<typeof deferred<Board | null>> }[] = [];
  const dirtyChecks: ReturnType<typeof deferred<ScannedWorktree[]>>[] = [];
  const onRead = vi.fn();
  const reads = createManagerReads({
    peekBoard(path) {
      const answer = deferred<Board | null>();
      boardReads.push({ path, answer });
      return answer.promise;
    },
    scanWorktrees() {
      const answer = deferred<ScannedWorktree[]>();
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

describe('sameDirtiness', () => {
  const answer = (dirty: string[], unreadable: string[] = [], checked = true) => (
    { checked, dirty: new Set(dirty), unreadable: new Set(unreadable) }
  );

  it('matches answers that would draw the same list, and nothing else', () => {
    expect(sameDirtiness(answer(['/a', '/b']), answer(['/b', '/a']))).toBe(true);
    expect(sameDirtiness(answer(['/a']), answer(['/b']))).toBe(false);
    expect(sameDirtiness(answer([], ['/a']), answer([]))).toBe(false);
    expect(sameDirtiness(answer([]), answer([], [], false))).toBe(false);
  });
});

describe('createManagerReads', () => {
  it('reads each project once, and not again until the answer is old', async () => {
    const { reads, boardReads, advance } = harness();
    reads.refresh(['/api'], []);
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(1);
    boardReads[0].answer.resolve(named('Todo'));
    await settle();
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(1);
    advance(BOARD_STALE_MS);
    reads.refresh(['/api'], []);
    expect(boardReads).toHaveLength(2);
  });

  it('draws again when an answer lands, and not when the board read back the same', async () => {
    const { reads, boardReads, onRead, advance } = harness();
    reads.refresh(['/api'], []);
    boardReads[0].answer.resolve(named('Todo'));
    await settle();
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(reads.boardOf('/api')).toEqual(named('Todo'));
    advance(BOARD_STALE_MS);
    reads.refresh(['/api'], []);
    boardReads[1].answer.resolve(named('Todo'));
    await settle();
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  // Nothing to count would otherwise draw the project as having nothing on it.
  it('keeps the last good board when there is nothing to count', async () => {
    const { reads, boardReads, advance } = harness();
    reads.refresh(['/api'], []);
    boardReads[0].answer.resolve(named('Todo'));
    await settle();
    advance(BOARD_STALE_MS);
    reads.refresh(['/api'], []);
    boardReads[1].answer.resolve(null);
    await settle();
    expect(reads.boardOf('/api')).toEqual(named('Todo'));
  });

  // The change may have landed after the running read took the file, so one more read follows it.
  it('reads again after a change reported while a read was running', async () => {
    const { reads, boardReads } = harness();
    reads.refresh(['/api'], []);
    reads.boardChanged('/api');
    expect(boardReads).toHaveLength(1);
    boardReads[0].answer.resolve(named('Old'));
    await settle();
    expect(boardReads).toHaveLength(2);
    boardReads[1].answer.resolve(named('New'));
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
    boardReads[0].answer.resolve(named('Todo'));
    await settle();
    reads.refresh([], []);
    expect(reads.boardOf('/api')).toBeUndefined();
  });

  it('checks the worktrees again when one appears, without waiting for the old answer to age', async () => {
    const { reads, dirtyChecks } = harness();
    reads.refresh([], ['/api.worktrees/a']);
    dirtyChecks[0].resolve(scan(['/api.worktrees/a']));
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
    dirtyChecks[0].resolve(scan([], ['/w']));
    await settle();
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    expect(dirtyChecks).toHaveLength(2);
    dirtyChecks[1].resolve(scan([], ['/w']));
    await settle();
    reads.forgetDirtiness();
    reads.refresh([], ['/w']);
    expect(dirtyChecks).toHaveLength(3);
  });

  // Keeping the old answer would call a worktree clean that nobody has looked at since.
  it('says nothing is known after a check that failed', async () => {
    const { reads, dirtyChecks, advance } = harness();
    reads.refresh([], ['/w']);
    dirtyChecks[0].resolve(scan(['/w']));
    await settle();
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    dirtyChecks[1].reject(new Error('git gone'));
    await settle();
    expect(reads.dirtiness().checked).toBe(false);
  });

  // Otherwise every check rebuilds the whole list under you to show the same thing.
  it('draws again only when a check answers differently from the last one', async () => {
    const { reads, dirtyChecks, onRead, advance } = harness();
    reads.refresh([], ['/w']);
    dirtyChecks[0].resolve(scan(['/w']));
    await settle();
    expect(onRead).toHaveBeenCalledTimes(1);
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    dirtyChecks[1].resolve(scan(['/w']));
    await settle();
    expect(onRead).toHaveBeenCalledTimes(1);
    advance(DIRTY_STALE_MS);
    reads.refresh([], ['/w']);
    dirtyChecks[2].reject(new Error('git gone'));
    await settle();
    expect(onRead).toHaveBeenCalledTimes(2);
  });

  it('lists every worktree the scan found, recorded or not, by project', async () => {
    const { reads, dirtyChecks } = harness();
    reads.refresh(['/api'], []);
    dirtyChecks[0].resolve(scan(['/api/.worktrees/agent'], ['/api.worktrees/hand']));
    await settle();
    expect(reads.worktreesOf('/api').map((worktree) => worktree.worktreePath))
      .toEqual(['/api/.worktrees/agent', '/api.worktrees/hand']);
    expect(reads.worktreesOf('/web')).toEqual([]);
  });

  // git not listing a recorded worktree is git not answering for it, which is not the same as clean.
  it('calls a recorded worktree the scan did not find unreadable', async () => {
    const { reads, dirtyChecks } = harness();
    reads.refresh(['/api'], ['/api.worktrees/recorded']);
    dirtyChecks[0].resolve(scan([], [], ['/api.worktrees/locked']));
    await settle();
    expect([...reads.dirtiness().unreadable].sort()).toEqual(['/api.worktrees/locked', '/api.worktrees/recorded']);
  });

  it('scans again when a project opens', async () => {
    const { reads, dirtyChecks } = harness();
    reads.refresh(['/api'], []);
    dirtyChecks[0].resolve(scan([]));
    await settle();
    reads.refresh(['/api', '/web'], []);
    expect(dirtyChecks).toHaveLength(2);
  });
});
