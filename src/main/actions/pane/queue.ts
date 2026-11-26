import type { Refused } from '../../../shared/app/bridge';
import type { Board } from '../../../shared/board/board';
import { failureText } from '../../../shared/errors/failure';
import { capReached, columnsBack, nextToStart, ordinal, placed, queuedWork, queueRefusal, queueText, readiness, withdrawnColumn, type NextStart, type QueueEntry } from '../../workers/pane-pool';
import type { SavedQueue } from '../../workers/pane-queue-store';
import { action, bind, isRefused, type BoundAction } from '../action';
import { isFilledText, isFilledTextOrNull } from './pane-input';

// The app-held pane pool (workers-decision-11): every start of new work, from `pane start`, a ship
// and a review, goes through pane.start, which starts it now when a slot is free and nothing is queued
// ahead of it, or queues it. pane.queue lists the queue and pane.unqueue withdraws an entry. drainQueue
// starts what the slots freed allow; the state changes that free one call it (session-requests.ts),
// and so does a timer, for what frees no slot: an --after card finishing, a project opening, the budget
// reading. Restore, `pane send` and New Claude never come here: they carry on work already begun.

export type PanePool = SavedQueue & {
  // The entries a start is under way for, each holding its slot until the start settles: a ship's
  // worktree takes minutes before its agent is in a pane to count.
  starting: Map<string, QueueEntry>;
  // False until the panes a restart brings back are back and counted.
  ready: boolean;
};

export type PaneQueuePorts = {
  pool: PanePool;
  save(saved: SavedQueue): void;
  // The panes holding a slot now (holdsSlot).
  running(): number;
  // settings.workers.cap, read at each drain.
  cap(): number | null;
  // Why the budget holds the queue, or null (budgetHold).
  budget(): string | null;
  open(projectPath: string): boolean;
  board(projectPath: string): Board | null;
  // The start itself: the run's claim and run, the ship, the review. A refusal is the start's.
  begin(entry: QueueEntry): Promise<{ output: string } | Refused>;
  // card.move, for a withdrawn card going back to the column it came from.
  move(projectPath: string, cardId: string, column: string): Promise<{ output: string } | Refused>;
  // An entry taken out without starting, dropped or withdrawn, for what waited on its start.
  gone(entry: QueueEntry): void;
  // A notice to the main of that page, behind whatever it is doing.
  tell(dispatcherPath: string, text: string): void;
  now(): number;
};

export type PaneStartInput = Omit<QueueEntry, 'id' | 'queuedAt'> & { first: boolean };

function startInput(raw: Record<string, unknown>): PaneStartInput | Refused {
  const { dispatcherPath, projectPath, cardId, after, first, work, returnTo = null } = raw;
  if (!isFilledText(dispatcherPath) || !isFilledText(projectPath)) return { refused: 'no project was given' };
  if (!isFilledTextOrNull(cardId) || !isFilledTextOrNull(after) || typeof first !== 'boolean') return { refused: 'the start was not one the app could read' };
  const read = queuedWork(work);
  const back = columnsBack(returnTo);
  if (read === undefined || back === undefined) return { refused: 'the start was not one the app could read' };
  return { dispatcherPath, projectPath, cardId, after, first, work: read, returnTo: back };
}

const taken = (ports: PaneQueuePorts) => ports.running() + ports.pool.starting.size;
const save = (ports: PaneQueuePorts) => ports.save({ next: ports.pool.next, entries: ports.pool.entries });

// What would start next, as it stands. An empty queue asks nothing: a drain runs on every hook's
// notify, and counting the slots walks every open pane. Each project's board is read once.
function next(ports: PaneQueuePorts): NextStart {
  if (ports.pool.entries.length === 0) return { held: null };
  if (!ports.pool.ready) return { held: 'the panes a restart brings back are not all back yet' };
  const boards = new Map<string, Board | null>();
  const boardOf = (projectPath: string): Board | null => {
    if (!boards.has(projectPath)) boards.set(projectPath, ports.board(projectPath));
    return boards.get(projectPath) ?? null;
  };
  return nextToStart(
    ports.pool.entries, taken(ports), ports.cap(), ports.budget,
    (entry) => readiness(entry, ports.open, () => boardOf(entry.projectPath)),
  );
}

// The start of one entry, its slot taken before the first await, so two drains in one tick never both
// see a free slot. Its main is told how it went unless it is the caller waiting on the answer.
function begin(ports: PaneQueuePorts, entry: QueueEntry, quiet: boolean): Promise<{ output: string } | Refused> {
  ports.pool.starting.set(entry.id, entry);
  const started = ports.begin(entry).catch((error: unknown): Refused => ({ refused: failureText(error) }));
  void started.then((result) => {
    ports.pool.starting.delete(entry.id);
    if (!quiet) ports.tell(entry.dispatcherPath, isRefused(result) ? `${entry.id} did not start: ${result.refused}` : `${entry.id} started: ${result.output}`);
    drainQueue(ports);
  });
  return started;
}

export type Drained = { own?: Promise<{ output: string } | Refused>; held: string | null };

// Every entry the free slots allow started, and every dropped one taken out with its main told, then
// the queue saved once if anything changed, `changed` saying the caller changed it first. `own` is the
// start or drop of the entry the caller is answering for, which is told nothing.
export function drainQueue(ports: PaneQueuePorts, answering: string | null = null, changed = false): Drained {
  let own: Drained['own'];
  for (;;) {
    const step = next(ports);
    if ('held' in step) {
      if (changed) save(ports);
      return { own, held: step.held };
    }
    const entry = 'drop' in step ? step.drop : step.start;
    ports.pool.entries = ports.pool.entries.filter((each) => each !== entry);
    changed = true;
    const quiet = entry.id === answering;
    if ('drop' in step) {
      ports.gone(entry);
      if (quiet) own = Promise.resolve({ refused: step.why });
      else ports.tell(entry.dispatcherPath, `${entry.id} dropped: ${step.why}`);
    } else {
      const started = begin(ports, entry, quiet);
      if (quiet) own = started;
    }
  }
}

// Queued, then drained: a start with a free slot and nothing ahead of it starts at once, and answers
// what its start answers. Anything else answers where it waits.
export const paneStart = action<PaneQueuePorts, PaneStartInput, { output: string }>('pane.start', {
  words: [],
  input: startInput,
  async run(ports, { first, ...input }) {
    const entry: QueueEntry = { id: `q${ports.pool.next}`, ...input, queuedAt: new Date(ports.now()).toISOString() };
    if (nestedReview(ports, entry)) return ports.begin(entry);
    const refusal = queueRefusal([...ports.pool.entries, ...ports.pool.starting.values()], entry, ports.board(entry.projectPath));
    if (refusal !== null) return { refused: refusal };
    ports.pool.next += 1;
    ports.pool.entries = placed(ports.pool.entries, entry, first);
    const { own, held } = drainQueue(ports, entry.id, true);
    if (own !== undefined) return own;
    const at = ports.pool.entries.indexOf(entry);
    return { output: `queued ${entry.id}, ${ordinal(at + 1)}${held === null ? '' : `: ${held}`}` };
  },
});

// A review's own start asking for it again: a review by hand on a card still in Doing runs card.follow,
// whose move into Review starts the review through card.review, inside the start already holding the
// slot. That start goes on in place rather than queueing behind itself. A real second start of the
// review is reviews.review's to refuse (review-flow.ts).
function nestedReview(ports: PaneQueuePorts, entry: QueueEntry): boolean {
  if (entry.work.kind !== 'review') return false;
  return [...ports.pool.starting.values()].some((each) => each.cardId === entry.cardId && each.work.kind === 'review');
}

export const paneQueue = action<PaneQueuePorts, Record<string, never>, { output: string }>('pane.queue', {
  words: [],
  input: () => ({}),
  run: async (ports) => {
    const step = next(ports);
    return { output: queueText(ports.pool.entries, 'held' in step ? step.held : null, ports.now()) };
  },
});

// Only by the main it would tell: another project's entry is its main's to withdraw. A card a move
// queued goes back to the column it came from, through card.move (withdrawnColumn).
export const paneUnqueue = action<PaneQueuePorts, { id: string; dispatcherPath: string }, { output: string }>('pane.unqueue', {
  words: [],
  input: ({ id, dispatcherPath }) => (isFilledText(id) && isFilledText(dispatcherPath) ? { id, dispatcherPath } : { refused: 'pane unqueue needs the id pane queue prints' }),
  async run(ports, { id, dispatcherPath }) {
    const entry = ports.pool.entries.find((each) => each.id === id);
    if (entry === undefined) return { refused: ports.pool.starting.has(id) ? `${id} is already starting` : `nothing queued as ${id}` };
    if (entry.dispatcherPath !== dispatcherPath) return { refused: `${id} was queued by another project's main` };
    ports.pool.entries = ports.pool.entries.filter((each) => each !== entry);
    save(ports);
    ports.gone(entry);
    const column = withdrawnColumn(entry, ports.board(entry.projectPath));
    if (column === null || entry.cardId === null) return { output: `withdrew ${id}` };
    if ('stays' in column) return { output: `withdrew ${id}; ${column.stays}` };
    const moved = await ports.move(entry.projectPath, entry.cardId, column.back);
    return { output: isRefused(moved) ? `withdrew ${id}; card ${entry.cardId} stays: ${moved.refused}` : `withdrew ${id}; card ${entry.cardId} back in ${column.back}` };
  },
});

// How often the queue is looked at for what frees no slot.
export const DRAIN_EVERY_MS = 30_000;

export type PanePoolActions = {
  start: BoundAction;
  queue: BoundAction;
  unqueue: BoundAction;
  drain(): void;
  // Why a start that never queues (`pane run` into a pane main holds) is refused now, or null.
  full(): string | null;
  // The panes a restart brings back are back: the queue may start what they leave room for, and is
  // looked at on a timer from now on.
  ready(): void;
};

// Main's wiring for the pool: the saved queue read once, the three actions bound on it.
export function panePool(saved: SavedQueue, main: Omit<PaneQueuePorts, 'pool'>): PanePoolActions {
  const ports: PaneQueuePorts = { ...main, pool: { ...saved, starting: new Map(), ready: false } };
  const drain = () => { drainQueue(ports); };
  return {
    start: bind(paneStart, ports),
    queue: bind(paneQueue, ports),
    unqueue: bind(paneUnqueue, ports),
    drain,
    full: () => {
      const full = capReached(taken(ports), ports.cap());
      return full === null ? null : `${full}: pane start queues the work until a worker frees`;
    },
    ready() {
      if (ports.pool.ready) return;
      ports.pool.ready = true;
      setInterval(drain, DRAIN_EVERY_MS).unref();
      drain();
    },
  };
}
