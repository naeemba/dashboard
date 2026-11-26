import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';
import { PAUSE_CEILING_MS } from '../../shared/workers/done-report';

// `pane landed`, what `pr land` and a board move into Done or Cancelled ask once main's own command put
// a worker's work in, and what a worker whose work is in looks like to `pane list` and its pause notice.
// auto-release.test.ts holds every case of the verdict itself.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const NOTHING_WAITING = { background: 0, scheduled: 0 };
const WORKTREE = '/work/api.worktrees/card-one';

// Main runs a worker in 2:1, in card-1's worktree on branch card-one, and its turn ends.
async function finished(...args: Parameters<typeof project>) {
  const fake = project({
    directoryOf: (id) => (id === '2:1' ? WORKTREE : '/work/api'),
    branch: async (worktreePath) => (worktreePath === WORKTREE ? 'card-one' : 'main'),
    ...args[0],
  });
  const answer = sessionRequests(fake.ports);
  const ask = (words: string[]) => answer({ directory: '/work/api', args: words });
  await ask(['claim']);
  await ask(['run', '2:1', 'fix the tests']);
  answer.notify('2:1', 'done', NOTHING_WAITING);
  return { ...fake, answer, ask };
}

describe('pane landed', () => {
  it('releases the worker on the merged branch, and says so', async () => {
    const { ask, closed, released } = await finished();
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'released 2:1' });
    expect(closed).toEqual(['2:1']);
    expect(released).toEqual(['2:1 card-one merged: released 2:1']);
  });

  it('releases the worker in the worktree of a card moved to Done', async () => {
    const { ask, closed, released } = await finished();
    expect(await ask(['landed', '--card', 'card-1'])).toEqual({ ok: true, output: 'released 2:1' });
    expect(closed).toEqual(['2:1']);
    expect(released).toEqual(['2:1 card finished: released 2:1']);
  });

  // A review pane's own pr land, or a worker moving its own card: it is waiting on this very answer.
  it('never releases the pane the command ran in', async () => {
    const { answer, ask, closed } = await finished();
    answer.notify('2:1', 'done', { background: 1, scheduled: 0 });
    expect(await ask(['landed', '--branch', 'card-one', '--from', '2:1'])).toEqual({ ok: true, output: '' });
    expect(closed).toEqual([]);
  });

  it('answers nothing, and closes nothing, for a branch or card no worker is on', async () => {
    const { ask, closed } = await finished();
    expect(await ask(['landed', '--branch', 'other'])).toEqual({ ok: true, output: '' });
    expect(await ask(['landed', '--card', 'card-3'])).toEqual({ ok: true, output: '' });
    expect(closed).toEqual([]);
  });

  it('matches no branch in a worktree already gone', async () => {
    const { ask, closed } = await finished({ exists: () => false });
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: '' });
    expect(closed).toEqual([]);
  });

  it('closes a worker paused on its own background work: its work is in', async () => {
    const { answer, ask, closed } = await finished();
    answer.notify('2:1', 'done', { background: 1, scheduled: 1 });
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'released 2:1' });
    expect(closed).toEqual(['2:1']);
  });

  it('keeps the pane with the keyboard, and lists it as done with its work in', async () => {
    const { ask, closed, keyboard } = await finished();
    keyboard.add('2:1');
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'kept 2:1: it has the keyboard' });
    expect(closed).toEqual([]);
    expect((await ask(['list'])).output).toContain('2:1\tterminal 2\tdone, work in: pane finish 2:1');
  });

  it('keeps a worker blocked on a question', async () => {
    const { answer, ask, closed } = await finished();
    answer.notify('2:1', 'blocked');
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'kept 2:1: it is waiting on a question' });
    expect(closed).toEqual([]);
  });

  it('keeps a worker mid-turn', async () => {
    const { answer, ask, closed } = await finished();
    answer.notify('2:1', 'running');
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'kept 2:1: it is mid-turn' });
    expect(closed).toEqual([]);
  });

  // The user is having a conversation with it: that turn is theirs.
  it('keeps a worker you typed into since main last sent it work', async () => {
    const { answer, ask, closed } = await finished();
    answer.notify('2:1', 'running', undefined, { promptSource: 'user', handed: true });
    answer.notify('2:1', 'running', undefined, { promptSource: 'user' });
    answer.notify('2:1', 'done', NOTHING_WAITING);
    expect(await ask(['landed', '--branch', 'card-one'])).toEqual({ ok: true, output: 'kept 2:1: you typed into it since main last sent it work' });
    expect(closed).toEqual([]);
  });

  it('keeps an agent no main handed work', async () => {
    const { ports, agents, closed } = project({ directoryOf: (id) => (id === '2:1' ? WORKTREE : '/work/api'), branch: async () => 'card-one' });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    // A Claude you opened by hand in 2:1.
    agents.add('2:1');
    answer.notify('2:1', 'done', NOTHING_WAITING);
    expect(await answer({ directory: '/work/api', args: ['landed', '--branch', 'card-one'] })).toEqual({ ok: true, output: 'kept 2:1: no main handed it work' });
    expect(closed).toEqual([]);
  });

  it('is refused from a folder in no open project', async () => {
    const { answer } = await finished();
    expect(await answer({ directory: '/elsewhere', args: ['landed', '--branch', 'card-one'] })).toMatchObject({ ok: false });
  });
});

// What `pr land` asks when its pull request conflicts with the base.
describe('pane conflicted', () => {
  it('sends /pr-conflicts to the agent on the branch, as main\'s work', async () => {
    const { ask, typed } = await finished();
    expect(await ask(['conflicted', 'card-one', '12', '--from', '2:0'])).toEqual({ ok: true, output: 'sent /pr-conflicts 12 to 2:1' });
    expect(typed).toHaveLength(1);
    expect(typed[0]).toMatch(/^2:1 \/pr-conflicts 12/);
  });

  // A review pane's own land is waiting on this answer, and the land alone is on the branch.
  it('sends nothing to the pane the land runs in, or for a branch no agent is on', async () => {
    const { ask, typed } = await finished();
    expect(await ask(['conflicted', 'card-one', '12', '--from', '2:1'])).toEqual({ ok: true, output: '' });
    expect(await ask(['conflicted', 'other', '12'])).toEqual({ ok: true, output: '' });
    expect(typed).toEqual([]);
  });

  it('sends nothing to a shell on the branch, which would run it', async () => {
    const { ask, agents, typed } = await finished();
    agents.delete('2:1');
    expect(await ask(['conflicted', 'card-one', '12'])).toEqual({ ok: true, output: '' });
    expect(typed).toEqual([]);
  });

  it('is refused words it does not take', async () => {
    const { ask } = await finished();
    expect(await ask(['conflicted', 'card-one'])).toMatchObject({ ok: false });
    expect(await ask(['conflicted', 'card-one', '12', '--from', 'main'])).toMatchObject({ ok: false });
  });
});

describe('a worker whose work is in', () => {
  it('is listed as done with its work in once its card is finished, until main sends it work', async () => {
    const { ask, finishedCards } = await finished();
    finishedCards.set('2:1', 'Done');
    expect((await ask(['list'])).output).toContain('done, work in: pane finish 2:1');
    await ask(['send', '2:1', 'one more thing']);
    expect((await ask(['list'])).output).not.toContain('work in');
  });

  it('is not listed so while it works', async () => {
    const { answer, ask, finishedCards } = await finished();
    finishedCards.set('2:1', 'Done');
    answer.notify('2:1', 'running');
    expect((await ask(['list'])).output).toContain('2:1\tterminal 2\trunning');
  });

  it('is never told to main as paused for the ceiling', async () => {
    const { answer, told, finishedCards } = await finished();
    finishedCards.set('2:1', 'Done');
    answer.notify('2:1', 'done', { background: 0, scheduled: 1 });
    vi.advanceTimersByTime(PAUSE_CEILING_MS);
    expect(told).toEqual([]);
  });
});

describe('the pause notice', () => {
  it('is told of a worker paused the whole ceiling that never reported', async () => {
    const { answer, told } = await finished();
    answer.notify('2:1', 'running');
    answer.notify('2:1', 'done', { background: 0, scheduled: 1 });
    vi.advanceTimersByTime(PAUSE_CEILING_MS);
    expect(told).toHaveLength(1);
  });

  // A leftover fallback wakeup after the report: the pause is moot.
  it('is not told of a worker that reported by message before it paused', async () => {
    const { answer, told } = await finished();
    answer.heard(2, 'api-terminal-2');
    answer.notify('2:1', 'running');
    answer.notify('2:1', 'done', { background: 0, scheduled: 1 });
    vi.advanceTimersByTime(PAUSE_CEILING_MS);
    expect(told).toEqual([]);
  });
});
