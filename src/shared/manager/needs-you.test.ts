import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import type { ManagerRow, PaneSummary } from './manager';
import { STALL_MS, needKey, needsInTurn, needsYou, nextLanding } from './needs-you';
import { NO_DAYS, NO_TOTALS } from './usage';
import type { WorktreeEntry } from './worktree-store';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const minutesAgo = (minutes: number) => NOW - minutes * 60_000;

const pane = (index: number, state: PaneSummary['state'], lastPrintedAt: number): PaneSummary => ({
  index, name: `terminal ${index + 1}`, state, lastPrintedAt, tokens: 0, tail: () => [], lastPrinted: () => '',
});

const card = (id: string, updatedAt?: string, pullRequest?: number): Card => ({
  id, title: `Card ${id}`, notes: '', priority: 'medium', parent: null, updatedAt, pullRequest,
});

const worktree = (cardId: string, pane: number | null, extra: Partial<WorktreeEntry> = {}): WorktreeEntry => ({
  cardId, title: `Card ${cardId}`, projectPath: '/api', branch: cardId, worktreePath: `/api-${cardId}`,
  pane, startedAt: '2026-10-01T08:00:00Z', reviewing: false, ...extra,
});

const row = (panes: PaneSummary[], worktrees: WorktreeEntry[] = []): ManagerRow => ({
  slot: 0, name: 'api', path: '/api', panes, tokens: NO_TOTALS, days: NO_DAYS, worktrees,
});

const board = (columns: Record<string, Card[]>): Board => ({
  columns: Object.entries(columns).map(([name, cards]) => ({ name, cards })),
});

const kinds = (rows: ManagerRow[], boardOf: Board | undefined, dirty: string[] = []) =>
  needsYou(rows, () => boardOf, new Set(dirty), NOW).map((need) => need.kind);

describe('needsYou', () => {
  it('lists a pane asking and a pane that died, and leaves a working pane off', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(5)), pane(1, 'exited', minutesAgo(10)), pane(2, 'quiet', minutesAgo(1))])];
    expect(kinds(rows, undefined)).toEqual(['exited', 'asking']);
  });

  it('puts the oldest first, across projects', () => {
    const rows = [
      row([pane(0, 'waiting', minutesAgo(2))]),
      { ...row([pane(0, 'waiting', minutesAgo(40))]), slot: 1, name: 'web', path: '/web' },
    ];
    expect(needsYou(rows, () => undefined, new Set(), NOW).map((need) => need.project)).toEqual(['web', 'api']);
  });

  // A ship puts the card back in Todo on the project's board; the agent moves it on its worktree's.
  it('flags an agent\'s pane once it has been quiet for the stall time, wherever its card sits', () => {
    const shipped = board({ Todo: [card('a')] });
    const quietFor = (ms: number) => [row([pane(0, 'quiet', 0), pane(1, 'quiet', NOW - ms)], [worktree('a', 1)])];
    expect(kinds(quietFor(STALL_MS), shipped)).toEqual(['stalled']);
    expect(kinds(quietFor(STALL_MS - 1), shipped)).toEqual([]);
  });

  it('does not call a quiet pane stalled while it reviews, or once its card is in Review or Done', () => {
    const quiet = [pane(0, 'quiet', minutesAgo(90))];
    expect(kinds([row(quiet, [worktree('a', 0, { reviewing: true })])], board({ Review: [card('a')] }))).toEqual([]);
    expect(kinds([row(quiet, [worktree('a', 0)])], board({ Review: [card('a')] }))).toEqual(['review']);
    expect(kinds([row(quiet, [worktree('a', 0)])], board({ Done: [card('a')] }))).toEqual([]);
  });

  it('does not list an asking pane twice when an agent is working a card in it', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(90))], [worktree('a', 0)])];
    expect(kinds(rows, board({ Todo: [card('a')] }))).toEqual(['asking']);
  });

  it('lists a Review card only while no review is running on it', () => {
    const review = board({ Review: [card('a', '2026-10-01T09:00:00Z', 31)] });
    expect(needsYou([row([])], () => review, new Set(), NOW)[0]).toMatchObject({
      kind: 'review', subject: '#31 Card a', target: { kind: 'card', cardId: 'a' },
    });
    expect(kinds([row([], [worktree('a', 0, { reviewing: true })])], review)).toEqual([]);
  });

  it('lists a Done card whose worktree still holds uncommitted work, and not a clean one', () => {
    const done = board({ Done: [card('a', '2026-10-01T10:00:00Z')] });
    const rows = [row([], [worktree('a', null)])];
    expect(kinds(rows, done, ['/api-a'])).toEqual(['leftover']);
    expect(kinds(rows, done, [])).toEqual([]);
  });

  it('sends Enter on a leftover to its card, which lands with or without a pane', () => {
    const done = board({ Done: [card('a', '2026-10-01T10:00:00Z')] });
    const [leftover] = needsYou([row([], [worktree('a', null)])], () => done, new Set(['/api-a']), NOW);
    expect(leftover.target).toEqual({ kind: 'card', cardId: 'a' });
    expect(leftover.worktree?.worktreePath).toBe('/api-a');
  });

  it('lists the panes before any board has been read', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(1))], [worktree('a', 0)])];
    expect(kinds(rows, undefined)).toEqual(['asking']);
  });
});

describe('needKey', () => {
  it('names two items on the same pane apart by what they are', () => {
    const [asking] = needsYou([row([pane(0, 'waiting', minutesAgo(1))])], () => undefined, new Set(), NOW);
    const [stalled] = needsYou([row([pane(0, 'quiet', minutesAgo(90))], [worktree('a', 0)])], () => undefined, new Set(), NOW);
    expect(asking.target).toEqual(stalled.target);
    expect(needKey(asking)).not.toBe(needKey(stalled));
  });
});

describe('needsInTurn', () => {
  const needs = needsYou(
    [row([pane(0, 'waiting', minutesAgo(30)), pane(1, 'waiting', minutesAgo(20)), pane(2, 'waiting', minutesAgo(10))])],
    () => undefined, new Set(), NOW,
  );
  const order = (lastKey: string | null) => needsInTurn(needs, lastKey).map((need) => need.subject);

  it('starts at the oldest when the key has landed nowhere yet', () => {
    expect(order(null)).toEqual(['terminal 1', 'terminal 2', 'terminal 3']);
  });

  it('goes on to the one after the last it landed on, and round to the oldest after the newest', () => {
    expect(order(needKey(needs[0]))).toEqual(['terminal 2', 'terminal 3', 'terminal 1']);
    expect(order(needKey(needs[2]))).toEqual(['terminal 1', 'terminal 2', 'terminal 3']);
  });

  it('starts at the oldest again once the last one it landed on has left the queue', () => {
    expect(order('need:asking:0:9')).toEqual(['terminal 1', 'terminal 2', 'terminal 3']);
  });
});

describe('nextLanding', () => {
  const needs = needsYou(
    [row([pane(0, 'waiting', minutesAgo(30)), pane(1, 'waiting', minutesAgo(20)), pane(2, 'waiting', minutesAgo(10))])],
    () => undefined, new Set(), NOW,
  );
  const landAll = () => '';

  it('reaches the second item on the second press', () => {
    const first = nextLanding(needs, null, landAll);
    expect(first).toEqual({ landedOn: needKey(needs[0]), reason: '' });
    expect(nextLanding(needs, first.landedOn, landAll)).toEqual({ landedOn: needKey(needs[1]), reason: '' });
  });

  it('skips an item it cannot land on and does not remember it', () => {
    const tried: string[] = [];
    const result = nextLanding(needs, null, (need) => {
      tried.push(need.subject);
      return need === needs[0] ? 'Gone' : '';
    });
    expect(tried).toEqual(['terminal 1', 'terminal 2']);
    expect(result).toEqual({ landedOn: needKey(needs[1]), reason: '' });
  });

  it('says the first reason, and lands nowhere, when no item can be landed on', () => {
    const result = nextLanding(needs, null, (need) => `No ${need.subject}`);
    expect(result).toEqual({ landedOn: null, reason: 'No terminal 1' });
  });

  it('says nothing needs you when the queue is empty', () => {
    expect(nextLanding([], null, landAll)).toEqual({ landedOn: null, reason: 'Nothing needs you' });
  });
});
