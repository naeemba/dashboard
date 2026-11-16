import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { closedReport, PAUSE_CEILING_MS } from '../../shared/workers/done-report';

// What closeFinished does with what the session command heard; auto-release.test.ts holds every case
// of the verdict itself.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const TEN_MINUTES = 10 * 60 * 1000;
const NOTHING_WAITING = { background: 0, scheduled: 0 };

// Main runs a worker in 2:1, which reports, has its report read by main, and stops.
async function reported(...args: Parameters<typeof project>) {
  const fake = project(...args);
  const answer = sessionRequests(fake.ports);
  await answer({ directory: '/work/api', args: ['claim'] });
  await answer({ directory: '/work/api', args: ['run', '2:1', 'fix the tests'] });
  answer.heard(2, 'api-terminal-2');
  answer.notify('2:1', 'done', NOTHING_WAITING);
  return { ...fake, answer };
}

describe('closeFinished', () => {
  it('releases a worker whose report main read, once it has sat idle for the grace period', async () => {
    const { answer, closed, released } = await reported();
    vi.advanceTimersByTime(TEN_MINUTES - 1);
    await answer.closeFinished();
    expect(closed).toEqual([]);
    vi.advanceTimersByTime(1);
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
    expect(released).toEqual(['2:1 reported done: released 2:1']);
  });

  it('keeps a worker main sent more work after its report, as at work', async () => {
    const { answer, closed } = await reported();
    await answer({ directory: '/work/api', args: ['send', '2:1', 'and the lint'] });
    vi.advanceTimersByTime(TEN_MINUTES);
    await answer.closeFinished();
    expect(closed).toEqual([]);
  });

  it('releases a worker whose card is finished as soon as its turn ends', async () => {
    const { answer, closed, released, finishedCards } = await reported();
    finishedCards.set('2:1', 'Done');
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
    expect(released).toEqual(['2:1 card done: released 2:1']);
  });

  // A --worktree worker has no card, so before this it waited out its grace period.
  const inWorktree = { directoryOf: () => '/work/api.worktrees/fix-the-tests' };

  it('releases a worker in a worktree whose branch merged as soon as its turn ends', async () => {
    const { answer, closed, released } = await reported({ ...inWorktree, merged: async () => true });
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
    expect(released).toEqual(['2:1 pull request merged: released 2:1']);
  });

  it('keeps a worker in a worktree when gh cannot say whether its branch merged', async () => {
    const { answer, closed } = await reported({ ...inWorktree, merged: async () => { throw new Error('gh: not logged in'); } });
    await answer.closeFinished();
    expect(closed).toEqual([]);
  });

  it('skips a sweep that comes due while the last still waits on gh', async () => {
    let answerGh: (merged: boolean) => void = () => undefined;
    let asked = 0;
    const gh = () => { asked += 1; return new Promise<boolean>((resolve) => { answerGh = resolve; }); };
    const { answer, closed } = await reported({ ...inWorktree, merged: gh });
    const first = answer.closeFinished();
    await answer.closeFinished();
    expect(asked).toBe(1);
    answerGh(true);
    await first;
    expect(closed).toEqual(['2:1']);
  });

  // You click into the pane while gh answers: it must not close under you.
  it('keeps a worker that took the keyboard while gh was answering, asking gh once', async () => {
    let answerGh: (merged: boolean) => void = () => undefined;
    let asked = 0;
    const gh = () => { asked += 1; return new Promise<boolean>((resolve) => { answerGh = resolve; }); };
    const { answer, closed, keyboard } = await reported({ ...inWorktree, merged: gh });
    const sweep = answer.closeFinished();
    await Promise.resolve();
    keyboard.add('2:1');
    answerGh(true);
    await sweep;
    expect(closed).toEqual([]);
    expect(asked).toBe(1);
  });

  it('never asks about the branch of a worker in the project\'s own checkout', async () => {
    const { answer, closed } = await reported({ merged: async () => true });
    await answer.closeFinished();
    expect(closed).toEqual([]);
  });

  it('tells main of a worker closed for its card before main read a report from it', async () => {
    const { ports, closed, told, finishedCards } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'fix the tests'] });
    answer.notify('2:1', 'done', NOTHING_WAITING);
    finishedCards.set('2:1', 'Done');
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
    expect(told).toEqual([`2 ${closedReport('api-terminal-2', '2:1', 'card done')}`]);
    // Main may not have read a report the worker did send: the notice must not deny one.
    expect(told[0]).not.toContain('without sending you a report');
  });

  // The turn may be the one reading the worker's report, which main hears only at its end.
  it('leaves a finished worker alone while its main is mid-turn, and releases it once the turn ends', async () => {
    const { ports, closed, told, finishedCards } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'fix the tests'] });
    answer.mainTurn(2, true);
    answer.notify('2:1', 'done', NOTHING_WAITING);
    finishedCards.set('2:1', 'Done');
    await answer.closeFinished();
    expect(closed).toEqual([]);
    answer.heard(2, 'api-terminal-2');
    answer.mainTurn(2, false);
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
    expect(told).toEqual([]);
  });

  // `idle` waits on main's background work too, which may never end.
  it('releases a finished worker anyway once its main has been mid-turn for the ceiling', async () => {
    const { ports, closed, finishedCards } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'fix the tests'] });
    answer.mainTurn(2, true);
    answer.notify('2:1', 'done', NOTHING_WAITING);
    finishedCards.set('2:1', 'Done');
    vi.advanceTimersByTime(PAUSE_CEILING_MS - 1);
    answer.mainTurn(2, true);
    await answer.closeFinished();
    expect(closed).toEqual([]);
    vi.advanceTimersByTime(1);
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
  });

  it('tells main nothing of a worker it read a report from', async () => {
    const { answer, told, finishedCards } = await reported();
    finishedCards.set('2:1', 'Done');
    await answer.closeFinished();
    expect(told).toEqual([]);
  });

  it('keeps the pane with the keyboard', async () => {
    const { answer, closed, keyboard, finishedCards } = await reported();
    keyboard.add('2:1');
    finishedCards.set('2:1', 'Done');
    await answer.closeFinished();
    expect(closed).toEqual([]);
  });

  it('never releases an agent no main handed work, and does once a main sends it some', async () => {
    const { ports, agents, closed, finishedCards } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    // A Claude you opened by hand in 2:1, whose card is done.
    agents.add('2:1');
    finishedCards.set('2:1', 'Done');
    answer.notify('2:1', 'done', NOTHING_WAITING);
    await answer.closeFinished();
    expect(closed).toEqual([]);
    await answer({ directory: '/work/api', args: ['send', '2:1', 'tidy up'] });
    expect(answer.workers()).toMatchObject([{ id: '2:1', dispatcher: 2, about: 'tidy up' }]);
    answer.notify('2:1', 'done', NOTHING_WAITING);
    await answer.closeFinished();
    expect(closed).toEqual(['2:1']);
  });
});
