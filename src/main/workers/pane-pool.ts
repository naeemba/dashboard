import type { WorkerState } from '../../shared/app/bridge';
import { relativeAge } from '../../shared/app/age';
import { baseName } from '../../shared/app/base-name';
import { isColumnNamed, selectionOf, type Board } from '../../shared/board/board';
import { columnEntry } from '../../shared/board/column-entry';
import { isPaused, workerAbout, type StopWaiting } from '../../shared/workers/worker-roster';
import { isRecord } from '../../shared/app/is-record';
import { isPaneKindOrNull } from '../../shared/panes/pane-kind';
import type { Settings } from '../../shared/settings/settings';
import { isFilledText, isFilledTextOrNull } from '../actions/pane/pane-input';
import type { BudgetVerdict } from '../command/budget-cli';
import { finishedColumnOf } from './auto-release';
import type { RunWords } from './session-cli';

// The app-held pane pool's decisions (workers-decision-11): which workers hold one of the cap's
// slots, which queued entry starts next or why the queue is held, and what a pool answers. The pool
// itself, its file and its doors are pane.start, pane.queue and pane.unqueue (actions/pane/queue.ts).

// What a queued entry starts, chosen then and not before: a run claims its pane at the start, a ship
// makes its worktree at the start, a review swaps its worktree at the start.
export type QueuedWork =
  // `pane start`'s words: --project, then run's. `folder` is --in's, already resolved.
  | { kind: 'run'; project: string | null } & RunWords
  | { kind: 'ship'; title: string }
  | { kind: 'review' };

export type ReturnTo = { from: string; into: string };

export type RunWork = Extract<QueuedWork, { kind: 'run' }>;
export type CardWork = Exclude<QueuedWork, RunWork>;

export type QueueEntry = {
  // q7: the counter's, never reused, so a main's stale id never withdraws somebody else's entry.
  id: string;
  // The page whose main is told when it starts, and who may withdraw it.
  dispatcherPath: string;
  // The project the work is in, whose board its card and --after card are on.
  projectPath: string;
  cardId: string | null;
  // A card that must be Done or Cancelled first (`--after`).
  after: string | null;
  // The move into Ship or Review that queued it, for a withdrawal to undo, or null: a start no move
  // made (`board ship`, `pane start`), or one made on the board screen, which has saved its move
  // already when the app hears of it.
  returnTo: ReturnTo | null;
  queuedAt: string;
  work: QueuedWork;
};

// The move a withdrawal undoes, as the queue's file and every door that starts work read it: null, or
// undefined for one that does not read.
export function columnsBack(stored: unknown): ReturnTo | null | undefined {
  if (stored === null) return null;
  return isRecord(stored) && isFilledText(stored.from) && isFilledText(stored.into) ? { from: stored.from, into: stored.into } : undefined;
}

// What an entry starts, as the queue's file and pane.start's door both read it, or undefined.
export function queuedWork(stored: unknown): QueuedWork | undefined {
  if (!isRecord(stored)) return undefined;
  if (stored.kind === 'review') return { kind: 'review' };
  if (stored.kind === 'ship') return isFilledText(stored.title) ? { kind: 'ship', title: stored.title } : undefined;
  const { project, prompt, card, worktree, folder, as } = stored;
  if (stored.kind !== 'run' || !isFilledText(prompt) || !isFilledTextOrNull(project) || !isFilledTextOrNull(card) || typeof worktree !== 'boolean' || !isFilledTextOrNull(folder) || !isPaneKindOrNull(as)) return undefined;
  return { kind: 'run', project, prompt, card, worktree, folder, as };
}

export type SlotLook = {
  // A main's worker with its agent in the pane: one a main ran, a card's agent, a review's.
  mainsWorker: boolean;
  // What its hooks last said, undefined until they say anything.
  state: WorkerState | undefined;
  // What its last Stop hook said it waits on, undefined until one says.
  waiting: StopWaiting | undefined;
  // Its card is finished or `pane landed` kept it: only `pane finish` is left for it.
  workIn: boolean;
  // How many `pr wait` and `pr land` runs of its own are waiting on CI now (pane.ci-wait).
  ciWaits: number;
};

// Running, blocked on a question and paused on its own background work each hold a slot: the first is
// working, the other two carry on by themselves (an answer, a wake-up). Done frees it, and so does a
// pause whose work is in, or one whose only background work is waiting on CI: `pr wait` and `pr land`
// say when they are, and ask for the slot back before they return (pane.ci-resume). A scheduled
// wake-up is no running work. A Claude opened by hand and main itself are no main's worker.
// ponytail: a wake-up that fires while its slot is given back runs over the cap until its turn ends;
// count wake-ups as holding if that shows.
// ponytail: a `pr wait` killed in the turn that starts other background work leaves one run over the
// cap until the next Stop lowers the count; reclaim on SIGTERM in pull-request-program.ts if that shows.
export function holdsSlot(look: SlotLook): boolean {
  if (!look.mainsWorker) return false;
  if (look.state !== 'done') return true;
  if (!isPaused(look.waiting) || look.workIn) return false;
  return look.ciWaits === 0 || look.waiting.background > look.ciWaits;
}

// No limit configured never holds the queue: limit none, or a cap with no weekly cap set, which is what
// a fresh install has. Otherwise anything but under the limit holds it, a stale reading included.
export function budgetHold(budget: Settings['budget'], verdict: () => BudgetVerdict): string | null {
  if (budget.limit === 'none' || (budget.limit === 'cap' && budget.weeklyCap === null)) return null;
  const read = verdict();
  return read.exitCode === 0 ? null : read.line;
}

// `why` is empty for ready.
export type Readiness = { state: 'ready' | 'wait' | 'drop'; why: string };

// What an entry's start waits on, given the facts about it now. A card already Done or Cancelled is
// dropped, so one cancelled while queued never starts an hour later, and so is a card deleted, or moved
// out of the column whose move queued it: dragged back out of Ship, it is not shipped twenty minutes
// later. A board that cannot be read drops nothing, and holds a ship or a review, which only starts
// for a card it can find: a card file caught mid-write comes back once it parses. A closed project
// waits, unless the start opens it (--project, as `pane claim --project` does), and so does a closed
// page of the main that queued it, which is the one told how the start went. An --after card waits
// until it is finished. A waiting entry never holds up the ones behind it. The board is read only for
// an entry with a card or an --after card.
export function readiness(entry: QueueEntry, open: (path: string) => boolean, boardOf: () => Board | null): Readiness {
  const board = entry.cardId === null && entry.after === null ? null : boardOf();
  const gone = entry.cardId === null || board === null ? null : cardGone(board, entry.cardId, entry.returnTo);
  if (gone !== null) return { state: 'drop', why: gone };
  const opensItself = entry.work.kind === 'run' && entry.work.project !== null;
  if (!open(entry.projectPath) && !opensItself) return { state: 'wait', why: `${baseName(entry.projectPath)} is not open` };
  if (!open(entry.dispatcherPath)) return { state: 'wait', why: `${baseName(entry.dispatcherPath)} is not open` };
  if (entry.work.kind !== 'run' && entry.cardId !== null && board === null) return { state: 'wait', why: `the board of ${baseName(entry.projectPath)} cannot be read` };
  if (entry.after !== null && finishedColumnOf(board, entry.after) === null) return { state: 'wait', why: `waits on card ${entry.after}` };
  return { state: 'ready', why: '' };
}

// Why a queued card's start is over before it began, or null.
function cardGone(board: Board, cardId: string, returnTo: ReturnTo | null): string | null {
  const finished = finishedColumnOf(board, cardId);
  if (finished !== null) return `card ${cardId} is ${finished}`;
  const at = selectionOf(board, cardId);
  if (at === null) return `card ${cardId} is not on the board`;
  if (returnTo !== null && !isColumnNamed(board.columns[at.column].name, returnTo.into)) return `card ${cardId} left ${returnTo.into}`;
  return null;
}

// The caps from settings: workers.cap for each project, workers.totalCap across them, null for none.
export type Caps = { project: number | null; total: number | null };

// The slots held in each project, keyed by its path: a pane by the page it is on, a start under way by
// its entry's project.
export type Running = ReadonlyMap<string, number>;

// Why nothing more may start anywhere, the total cap reached, or null.
export function totalReached(running: Running, caps: Caps): string | null {
  const total = [...running.values()].reduce((sum, count) => sum + count, 0);
  return caps.total !== null && total >= caps.total ? `${total} running, the total cap is ${caps.total}` : null;
}

// Why nothing more may start in this project by its own cap, or null.
function projectReached(running: Running, caps: Caps, projectPath: string): string | null {
  const here = running.get(projectPath) ?? 0;
  return caps.project !== null && here >= caps.project ? `${here} running in ${baseName(projectPath)}, the cap per project is ${caps.project}` : null;
}

// Why nothing more may start in this project, either cap reached, or null.
export function capReached(running: Running, caps: Caps, projectPath: string): string | null {
  return totalReached(running, caps) ?? projectReached(running, caps, projectPath);
}

export type NextStart = { start: QueueEntry } | { drop: QueueEntry; why: string } | { held: string | null };

// The entry to start next, first in first out, or one to drop, or why the queue is held, null for an
// empty queue. The total cap holds every entry; a project at its own cap waits as a closed one does,
// letting later entries for other projects go ahead. The budget is read last, and only when something
// would start.
export function nextToStart(
  entries: readonly QueueEntry[], running: Running, caps: Caps, budget: () => string | null, readinessOf: (entry: QueueEntry) => Readiness,
): NextStart {
  if (entries.length === 0) return { held: null };
  const read = entries.map((entry) => ({ entry, ...readinessOf(entry) }));
  const dropped = read.find(({ state }) => state === 'drop');
  if (dropped !== undefined) return { drop: dropped.entry, why: dropped.why };
  const full = totalReached(running, caps);
  if (full !== null) return { held: full };
  const first = read.find(({ state, entry }) => state === 'ready' && projectReached(running, caps, entry.projectPath) === null);
  if (first === undefined) {
    const [{ entry, state, why }] = read;
    return { held: `${entry.id} ${state === 'ready' ? `waits for a slot: ${projectReached(running, caps, entry.projectPath) ?? ''}` : why}` };
  }
  const over = budget();
  return over === null ? { start: first.entry } : { held: over };
}

// A worker asking for its slot back once CI is done (pane.ci-resume), as the drain reads it: the
// project of the page it is on, null once it is no main's worker, and whether it holds a slot anyway.
export type Resumer = { projectPath: string | null; holds: boolean };

// The first resumer that may go on now, ahead of every queued entry, or -1. One that is no longer a
// worker, or holds a slot already (running again, or other background work), takes none; any other
// needs room under both caps.
// Each resumer is looked up only when it is reached.
export function nextResume<T>(resumers: readonly T[], look: (resumer: T) => Resumer, running: Running, caps: Caps): number {
  return resumers.findIndex((resumer) => {
    const { projectPath, holds } = look(resumer);
    return projectPath === null || holds || capReached(running, caps, projectPath) === null;
  });
}

// The column a withdrawn entry's card goes back to, or why it stays. Only a card still where the move
// put it goes back, and never into a column whose entry starts something: back into Review would
// start the review being withdrawn from Ship.
export function withdrawnColumn(entry: QueueEntry, board: Board | null): { back: string } | { stays: string } | null {
  if (entry.cardId === null || entry.returnTo === null || board === null) return null;
  const at = selectionOf(board, entry.cardId);
  if (at === null || !isColumnNamed(board.columns[at.column].name, entry.returnTo.into)) return null;
  const { from, into } = entry.returnTo;
  if (columnEntry({ column: from, source: 'command', autoLoop: false, projectBoard: true }) !== 'nothing') {
    return { stays: `card ${entry.cardId} stays in ${into}: back in ${from} would start it again` };
  }
  return { back: from };
}

// Why the entry may not be queued, or null. A card queued twice would start two agents in one
// worktree; an --after card the board does not have would hold the entry for good.
export function queueRefusal(queued: readonly QueueEntry[], entry: QueueEntry, board: Board | null): string | null {
  const twin = entry.cardId === null ? undefined : queued.find((each) => each.cardId === entry.cardId);
  if (twin !== undefined) return `card ${entry.cardId} is already queued as ${twin.id}`;
  if (entry.after !== null && (board === null || selectionOf(board, entry.after) === null)) return `no card ${entry.after} on the board to wait on`;
  return null;
}

// At the head with --first, else at the back.
export function placed(entries: readonly QueueEntry[], entry: QueueEntry, first: boolean): QueueEntry[] {
  return first ? [entry, ...entries] : [...entries, entry];
}

export function ordinal(position: number): string {
  const tens = position % 100;
  if (tens >= 11 && tens <= 13) return `${position}th`;
  return `${position}${['th', 'st', 'nd', 'rd'][position % 10] ?? 'th'}`;
}

// What the entry is, as `pane queue` and the workers popup list it.
export function entryAbout(entry: QueueEntry): string {
  if (entry.work.kind === 'ship') return `ship ${entry.cardId} "${entry.work.title}"`;
  if (entry.work.kind === 'review') return `review ${entry.cardId}`;
  return `run ${workerAbout(entry.work.prompt)}`;
}

// `pane queue`: a line per entry in the order they start, then why the queue is held, if it is.
export function queueText(entries: readonly QueueEntry[], held: string | null, now: number): string {
  if (entries.length === 0) return 'nothing queued';
  const lines = entries.map((entry, at) => [
    entry.id, ordinal(at + 1), baseName(entry.projectPath), entryAbout(entry), `queued ${relativeAge(entry.queuedAt, now) ?? ''}`,
    ...(entry.after === null ? [] : [`after ${entry.after}`]),
  ].join('\t'));
  return held === null ? lines.join('\n') : [...lines, `held: ${held}`].join('\n');
}
