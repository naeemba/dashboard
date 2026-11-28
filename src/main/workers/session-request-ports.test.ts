import { describe, expect, it } from 'vitest';
import type { Project, WorktreeEntry } from '../../shared/app/bridge';
import type { LogDraft } from '../../shared/app/log-entry';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import type { PaneReading } from '../../shared/panes/pane-reading';
import { terminalId } from '../../shared/panes/terminals';
import type { BoundAction } from '../actions/action';
import type { PoolPorts } from './pane-pool-ports';
import { sessionRequestPorts, type SessionRequestMain } from './session-request-ports';

const crm: Project = { name: 'crm', path: '/work/crm', missing: false };
const entry: WorktreeEntry = {
  cardId: 'a', title: 'Fix login', projectPath: '/work/crm', branch: 'fix-login', worktreePath: '/work/crm.worktrees/fix-login',
  pane: 2, startedAt: '2026-11-27T12:00:00.000Z', reviewing: true,
};

// A recording action: every call's input, answered with an empty output.
function action(calls: Record<string, unknown>[]): BoundAction<{ output: string; index: number; handed: boolean }> {
  return { name: 'fake', words: [], call: async (raw) => { calls.push(raw); return { output: '', index: 1, handed: false }; } };
}

function fakeMain() {
  const dispatched: Record<string, unknown>[] = [];
  const taken: unknown[][] = [];
  const given: unknown[][] = [];
  const forgotten: string[] = [];
  const sent: unknown[][] = [];
  const logged: LogDraft[] = [];
  const readings: PaneReading[] = [
    { index: 1, foreground: 'zsh', shell: 'zsh', command: { args: [], directory: '/work/crm' }, inWorktree: false, screen: false },
    { index: 2, foreground: 'zsh', shell: 'zsh', command: { args: ['claude'], directory: entry.worktreePath }, inWorktree: true, screen: false },
    { index: 3, foreground: 'npm', shell: 'zsh', command: { args: [], directory: '/work/crm' }, inWorktree: false, screen: false },
  ];
  const main: SessionRequestMain = {
    projects: [crm, undefined],
    readings: {
      slotOfProject: (projectPath) => (projectPath === crm.path ? 0 : -1), openPanes: () => [1, 2, 3], agentIn: () => false,
      agentRunsIn: (slot, pane) => slot === 0 && pane === 2, paneReadingsIn: () => readings,
    },
    commands: new Map([[terminalId(0, 3), { args: [], directory: '/work/crm' }]]),
    mainsWorkers: new Map([[terminalId(0, 2), '/work/crm']]),
    workerScreens: { folder: (id) => (id === terminalId(0, 2) ? entry.worktreePath : undefined) },
    openProject: async () => 0,
    pane: { open: action([]), dispatch: action(dispatched), close: action([]), send: action([]) },
    worktrees: { entries: () => [entry], takePane: (...args) => { taken.push(args); return []; } },
    reviews: { forget: (cardId) => { forgotten.push(cardId); } },
    giveCardPane: (...args) => { given.push(args); return args[0]; },
    sendToRenderer: (...args) => { sent.push(args); },
    prompt: () => undefined,
    browser: { turnEnded: () => undefined },
    chats: { tell: () => 'm1', withdraw: async () => { throw new Error('already sent'); } },
    worktree: { makeThrowaway: async () => ({ output: '', worktreePath: '/tmp/w', branch: 'w' }), throwawayPorts: {} as SessionRequestMain['worktree']['throwawayPorts'] },
    hasKeyboard: () => false,
    boardLog: { latest: () => null },
    log: (draft) => { logged.push(draft); },
    pool: {} as PoolPorts,
    stallMinutes: () => 20,
  };
  return { main, dispatched, taken, given, forgotten, sent, logged };
}

const start = { directory: '/work/crm', prompt: 'go', as: null, dispatcherPath: '/work/crm' };

describe('sessionRequestPorts', () => {
  it("gives a card's worker the card's record, its review over, and dispatches it in the project", async () => {
    const { main, dispatched, given, forgotten, taken } = fakeMain();
    await sessionRequestPorts(main).startWorker(terminalId(0, 4), { ...start, cardId: 'a' });
    expect(forgotten).toEqual(['a']);
    expect(given).toEqual([[{ ...entry, reviewing: false }, 4]]);
    expect(taken).toEqual([]);
    expect(dispatched).toEqual([{ id: terminalId(0, 4), projectPath: '/work/crm', directory: '/work/crm', prompt: 'go', resume: null, cardId: 'a', dispatcherPath: '/work/crm', as: null }]);
  });

  it('takes the pane off any card for a worker with none, falling back to its folder on a closed page', async () => {
    const { main, dispatched, given, taken } = fakeMain();
    await sessionRequestPorts(main).startWorker(terminalId(1, 4), { ...start, directory: '/work/gone', cardId: null });
    expect(given).toEqual([]);
    expect(taken).toEqual([['', 4, '']]);
    expect(dispatched[0]).toMatchObject({ projectPath: '/work/gone', directory: '/work/gone' });
  });

  it("answers a card's worktree only for its own project, with whether its agent runs", () => {
    const ports = sessionRequestPorts(fakeMain().main);
    expect(ports.cardWorktree('/work/crm', 'a')).toEqual({ worktreePath: entry.worktreePath, working: true });
    expect(ports.cardWorktree('/work/api', 'a')).toBeUndefined();
    expect(ports.cardWorktree('/work/crm', 'b')).toBeUndefined();
  });

  it('names what keeps a pane busy, and nothing for an idle or unknown one', () => {
    const ports = sessionRequestPorts(fakeMain().main);
    expect([1, 2, 3, 9].map((index) => ports.busyWith(terminalId(0, index)))).toEqual([null, 'an agent', 'npm', null]);
  });

  it("lists the manager and every open page, and reads a pane's folder and dispatcher", () => {
    const ports = sessionRequestPorts(fakeMain().main);
    expect(ports.openSlots()).toEqual([{ slot: MANAGER_SLOT, name: expect.any(String) }, { slot: 0, name: 'crm' }]);
    expect(ports.projectPath(1)).toBeUndefined();
    expect(ports.directoryOf(terminalId(0, 2))).toBe(entry.worktreePath);
    expect(ports.directoryOf(terminalId(0, 3))).toBe('/work/crm');
    expect(ports.dispatcherOf(terminalId(0, 2))).toBe('/work/crm');
  });

  it("logs and shows a released pane, logs a thrown-away one, and swallows a withdrawal that came too late", () => {
    const { main, sent, logged } = fakeMain();
    const ports = sessionRequestPorts(main);
    ports.released(terminalId(0, 2), 'card done', 'closed');
    ports.threwAway(terminalId(0, 3), 'nothing in it', '/work/crm');
    ports.mark(terminalId(0, 2), 'done');
    expect(() => ports.withdraw(0, 'm1')).not.toThrow();
    expect(logged).toEqual([
      { level: 'info', kind: 'pane', project: '/work/crm', message: 'closed: card done' },
      { level: 'info', kind: 'worktree', project: '/work/crm', message: `pane ${terminalId(0, 3)} closed: nothing in it` },
    ]);
    expect(sent).toEqual([['pane:released', `Closed pane ${terminalId(0, 2)}: card done`], ['pane:mark', terminalId(0, 2), 'done']]);
  });

  it('hands open, close and send to the pane actions, and finds the page a folder is in', async () => {
    const { main } = fakeMain();
    const opened: Record<string, unknown>[] = [];
    const closed: Record<string, unknown>[] = [];
    const typed: Record<string, unknown>[] = [];
    const ports = sessionRequestPorts({ ...main, pane: { ...main.pane, open: action(opened), close: action(closed), send: action(typed) } });
    await ports.open(0);
    await ports.close(terminalId(0, 2));
    await ports.send(terminalId(0, 2), 'go on', '/work/crm');
    expect([opened, closed, typed]).toEqual([[{ slot: 0 }], [{ id: terminalId(0, 2) }], [{ id: terminalId(0, 2), text: 'go on', dispatcherPath: '/work/crm' }]]);
    expect(ports.slotOf('/work/crm/src')).toBe(0);
    expect(ports.slotOf('/work/api')).toBe(-1);
  });

  it("reads the card a pane's record names off the board", () => {
    const ports = sessionRequestPorts(fakeMain().main);
    expect(ports.finishedCard(terminalId(0, 2))).toBeNull();
    expect(ports.paneCard(terminalId(0, 2))).toEqual({ id: 'a', title: 'Fix login', column: null, branch: 'fix-login' });
    expect(ports.paneCard(terminalId(0, 1))).toBeUndefined();
  });
});
