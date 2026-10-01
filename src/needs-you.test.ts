import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import type { ManagerRow, PaneSummary } from './manager';
import { STALL_MS, needKey, needsYou } from './needs-you';
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

  it('flags the pane of a Doing card once it has been quiet for the stall time', () => {
    const doing = board({ Doing: [card('a')] });
    const quietFor = (ms: number) => [row([pane(0, 'quiet', 0), pane(1, 'quiet', NOW - ms)], [worktree('a', 1)])];
    expect(kinds(quietFor(STALL_MS), doing)).toEqual(['stalled']);
    expect(kinds(quietFor(STALL_MS - 1), doing)).toEqual([]);
  });

  it('does not call a quiet pane stalled when its card is not in Doing', () => {
    const rows = [row([pane(0, 'quiet', minutesAgo(90))], [worktree('a', 0)])];
    expect(kinds(rows, board({ Todo: [card('a')] }))).toEqual([]);
  });

  it('does not list an asking pane twice when its card is also in Doing', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(90))], [worktree('a', 0)])];
    expect(kinds(rows, board({ Doing: [card('a')] }))).toEqual(['asking']);
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

  it('lists the panes before any board has been read', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(1))], [worktree('a', 0)])];
    expect(kinds(rows, undefined)).toEqual(['asking']);
  });
});

describe('needKey', () => {
  it('names two items on the same pane apart by what they are', () => {
    const rows = [row([pane(0, 'waiting', minutesAgo(1))])];
    const [asking] = needsYou(rows, () => undefined, new Set(), NOW);
    expect(needKey(asking)).toBe('need:asking:0:0');
  });
});
