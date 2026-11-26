import type { WorkerState } from '../../shared/app/bridge';
import { relativeAge } from '../../shared/app/age';
import { baseName } from '../../shared/app/base-name';
import { selectionOf, type Board } from '../../shared/board/board';
import type { PaneKind } from '../../shared/panes/pane-kind';
import type { Settings } from '../../shared/settings/settings';
import type { BudgetVerdict } from '../command/budget-cli';
import { finishedColumnOf } from './auto-release';

// The app-held pane pool's decisions (workers-decision-11): which workers hold one of the cap's
// slots, which queued entry starts next or why the queue is held, and what a pool answers. The pool
// itself, its file and its doors are pane.start, pane.queue and pane.unqueue (actions/pane/queue.ts).

// What a queued entry starts, chosen then and not before: a run claims its pane at the start, a ship
// makes its worktree at the start, a review swaps its worktree at the start.
export type QueuedWork =
  // `pane start`'s words: --project, then run's. `folder` is --in's, already resolved.
  | { kind: 'run'; project: string | null; prompt: string; card: string | null; worktree: boolean; folder: string | null; as: PaneKind | null }
  | { kind: 'ship'; title: string }
  | { kind: 'review' };

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
  queuedAt: string;
  work: QueuedWork;
};

export type SlotLook = {
  // A main's worker with its agent in the pane: one a main ran, a card's agent, a review's.
  mainsWorker: boolean;
  // What its hooks last said, undefined until they say anything.
  state: WorkerState | undefined;
  // Done, with background tasks or wakeups still pending.
  paused: boolean;
  // Its card is finished or `pane landed` kept it: only `pane finish` is left for it.
  workIn: boolean;
};

// Running, blocked on a question and paused on its own background work each hold a slot: the first is
// working, the other two carry on by themselves (an answer, a CI wake-up), and the hook cannot tell a
// CI wait from a test run. Done frees it, and so does a pause whose work is in. A Claude opened by
// hand and main itself are no main's worker.
export function holdsSlot(look: SlotLook): boolean {
  if (!look.mainsWorker) return false;
  if (look.state !== 'done') return true;
  return look.paused && !look.workIn;
}

// No limit configured never holds the queue: limit none, or a cap with no weekly cap set, which is what
// a fresh install has. Otherwise anything but under the limit holds it, a stale reading included.
export function budgetHold(budget: Settings['budget'], verdict: () => BudgetVerdict): string | null {
  if (budget.limit === 'none' || (budget.limit === 'cap' && budget.weeklyCap === null)) return null;
  const read = verdict();
  return read.exitCode === 0 ? null : read.line;
}

export type Readiness = { state: 'ready' } | { state: 'wait' | 'drop'; why: string };

// What an entry's start waits on, given the facts about it now. A card already Done or Cancelled is
// dropped, so one cancelled while queued never starts an hour later. A closed project waits, unless
// the start opens it (--project, as `pane claim --project` does). An --after card waits until it is
// finished. A waiting entry never holds up the ones behind it.
export function readiness(entry: QueueEntry, open: boolean, board: Board | null): Readiness {
  const finished = entry.cardId === null ? null : finishedColumnOf(board, entry.cardId);
  if (finished !== null) return { state: 'drop', why: `card ${entry.cardId} is ${finished}` };
  const opensItself = entry.work.kind === 'run' && entry.work.project !== null;
  if (!open && !opensItself) return { state: 'wait', why: `${baseName(entry.projectPath)} is not open` };
  if (entry.after !== null && finishedColumnOf(board, entry.after) === null) return { state: 'wait', why: `waits on card ${entry.after}` };
  return { state: 'ready' };
}

// Why nothing more may start, the cap reached, or null. `running` counts the slots held and the starts
// under way.
export function capReached(running: number, cap: number | null): string | null {
  return cap !== null && running >= cap ? `${running} running, the cap is ${cap}` : null;
}

export type NextStart = { start: QueueEntry } | { drop: QueueEntry; why: string } | { held: string } | null;

// The entry to start next, first in first out, or one to drop, or why the queue is held, or null for an
// empty queue. The budget is read last, and only when something would start.
export function nextToStart(
  entries: readonly QueueEntry[], running: number, cap: number | null, budget: () => string | null, readinessOf: (entry: QueueEntry) => Readiness,
): NextStart {
  if (entries.length === 0) return null;
  const read = entries.map((entry) => ({ entry, ready: readinessOf(entry) }));
  const dropped = read.find(({ ready }) => ready.state === 'drop');
  if (dropped !== undefined && dropped.ready.state === 'drop') return { drop: dropped.entry, why: dropped.ready.why };
  const full = capReached(running, cap);
  if (full !== null) return { held: full };
  const first = read.find(({ ready }) => ready.state === 'ready');
  if (first === undefined) {
    const [head] = read;
    return { held: `${head.entry.id} ${head.ready.state === 'ready' ? '' : head.ready.why}` };
  }
  const over = budget();
  return over === null ? { start: first.entry } : { held: over };
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

// What the entry is, as `pane queue` lists it.
function entryAbout(entry: QueueEntry): string {
  if (entry.work.kind === 'ship') return `ship ${entry.cardId} "${entry.work.title}"`;
  if (entry.work.kind === 'review') return `review ${entry.cardId}`;
  const prompt = entry.work.prompt.split('\n')[0];
  return `run ${prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt}`;
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
