import { sessionRequests, type SessionPorts, type WorkerStart } from './session-requests';

// The session command's fake app for session-requests.test.ts and close-finished.test.ts.

// One project, api, in slot 2, with main open and nothing else until a test opens a worker.
export function project(overrides: Partial<SessionPorts> = {}) {
  const open = [0];
  const agents = new Set<string>(['2:0']);
  // Main's record of its workers, which main.ts keeps: added by a run, gone with the agent or the pane.
  const workers = new Set<string>();
  const started: ({ id: string } & WorkerStart)[] = [];
  const closed: string[] = [];
  const marked: string[] = [];
  const removed: string[] = [];
  const told: string[] = [];
  // The told messages taken back, by their place in `told`.
  const withdrawn: string[] = [];
  const typed: string[] = [];
  const released: string[] = [];
  // The panes with the keyboard, and each card a pane's worktree is for that is finished.
  const keyboard = new Set<string>();
  const finishedCards = new Map<string, string>();
  const ports: SessionPorts = {
    slotOf: (directory) => (directory.startsWith('/work/api') ? 2 : -1),
    projectPath: (slot) => (slot === 2 ? '/work/api' : undefined),
    openSlots: () => [{ slot: 2, name: 'api' }],
    findProject: (word) => ({ ok: false, message: `no project is called ${word}` }),
    openProject: async () => 2,
    openPanes: () => open,
    agentIn: (id) => agents.has(id),
    busyWith: (id) => (agents.has(id) ? 'an agent' : null),
    directoryOf: () => '/work/api',
    mainsWorkerIn: (id) => workers.has(id),
    open: async () => {
      const index = open.length;
      open.push(index);
      return { index };
    },
    startWorker: async (id, start) => {
      agents.add(id);
      workers.add(id);
      started.push({ id, ...start });
      return { output: '' };
    },
    close: async (id) => {
      closed.push(id);
      agents.delete(id);
      workers.delete(id);
      open.splice(open.indexOf(Number(id.split(':')[1])), 1);
      return { output: '' };
    },
    mark: (id, state) => { marked.push(`${id} ${state}`); },
    send: async (id, text) => {
      typed.push(`${id} ${text}`);
      const handed = agents.has(id);
      if (handed) workers.add(id);
      return { output: `typed into ${id}`, handed };
    },
    tell: (slot, text) => String(told.push(`${slot} ${text}`) - 1),
    withdraw: (slot, messageId) => { withdrawn.push(`${slot} ${messageId}`); },
    cardWorktree: (_projectPath, cardId) => ({
      'card-1': { worktreePath: '/work/api.worktrees/card-one', working: false },
      'card-3': { worktreePath: '/work/api.worktrees/card-three', working: true },
    })[cardId],
    makeWorktree: async () => '/work/api.worktrees/fix-the-tests',
    exists: () => true,
    unfinished: async () => null,
    removeWorktree: async (worktreePath, projectPath) => { removed.push(`${worktreePath} from ${projectPath}`); },
    hasKeyboard: (id) => keyboard.has(id),
    finishedCard: (id) => finishedCards.get(id) ?? null,
    closeAfterMs: () => 10 * 60 * 1000,
    released: (id, reason, output) => { released.push(`${id} ${reason}: ${output}`); },
    ...overrides,
  };
  const ask = (commandArguments: string[], directory = '/work/api') => sessionRequests(ports)({ directory, args: commandArguments });
  return { ports, ask, open, agents, workers, started, closed, marked, removed, told, withdrawn, typed, released, keyboard, finishedCards };
}
