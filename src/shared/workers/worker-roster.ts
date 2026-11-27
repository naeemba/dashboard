import type { WorkerState } from '../app/bridge';
import type { SearchRow } from '../app/fuzzy';
import { paneFromId, paneLabel } from '../panes/terminals';
import { cacheWarmth, type CacheUse } from '../usage/cache-warmth';

// The workers a main session dispatched, as the Claude screen's status line counts them and its
// workers popup lists them. Main builds the list from what `pane list` already reads
// (session-requests.ts); the decisions about it are here so both ends agree.

export type WorkerStatus = 'working' | 'paused' | 'blocked' | 'done' | 'idle';

// What a worker's Stop hook said its session still waits on: background tasks in flight (shells,
// subagents, monitors, workflows) and wakeups scheduled (CronCreate, ScheduleWakeup, /loop). Claude
// Code's StopHookInput carries both as `background_tasks` and `session_crons`; an older one, neither.
export type StopWaiting = { background: number; scheduled: number };

// Anything in either is a turn that ends to be woken again, not the worker done. A stop that did not
// say is not a pause.
export function isPaused(waiting: StopWaiting | undefined): waiting is StopWaiting {
  return waiting !== undefined && (waiting.background > 0 || waiting.scheduled > 0);
}

const counted = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

// `waiting on 2 background tasks and 1 wakeup`, as `pane list` and the workers popup say a pause.
export function waitingText(waiting: StopWaiting): string {
  const parts = [
    waiting.background > 0 ? counted(waiting.background, 'background task') : '',
    waiting.scheduled > 0 ? counted(waiting.scheduled, 'wakeup') : '',
  ].filter(Boolean);
  return `waiting on ${parts.join(' and ')}`;
}

export type DispatchedWorker = {
  id: string;
  // The slot whose main ran it, which is another project's for a pane claimed with --project.
  dispatcher: number;
  // The project whose page the pane is on, and the worker's session name.
  project: string;
  name: string;
  // The first words of the prompt it was given.
  about: string;
  status: WorkerStatus;
  // What a paused worker waits on, as waitingText says it.
  waiting?: string;
};

// The order the count and the popup give the states in: what still runs first, what is finished last.
const ORDER: readonly WorkerStatus[] = ['working', 'paused', 'blocked', 'done', 'idle'];

const ABOUT_WORDS = 8;

export function workerAbout(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  return words.length > ABOUT_WORDS ? `${words.slice(0, ABOUT_WORDS).join(' ')}…` : words.join(' ');
}

// What a worker is doing now. Its agent gone, it is idle whatever its hooks last said: the pane is a
// shell again. Running, a pause if its Stop hook said it waits on something, else its hooks' last
// word; none yet is the agent at work.
export function workerStatus(agentRunning: boolean, said: WorkerState | undefined, paused = false): WorkerStatus {
  if (!agentRunning) return 'idle';
  if (paused) return 'paused';
  return said === 'blocked' || said === 'done' ? said : 'working';
}

// The status line's button: `3 workers: 2 working, 1 done`, the states in ORDER and only those with a
// worker in them, then `· 2 queued` for the starts waiting in the pane pool. Empty when there are
// neither, and the button is not drawn.
export function workerCount(workers: readonly DispatchedWorker[], queued = 0): string {
  const counts = ORDER.flatMap((status) => {
    const count = workers.filter((worker) => worker.status === status).length;
    return count === 0 ? [] : [`${count} ${status}`];
  });
  return [
    workers.length === 0 ? '' : `${counted(workers.length, 'worker')}: ${counts.join(', ')}`,
    queued === 0 ? '' : `${queued} queued`,
  ].filter(Boolean).join(' · ');
}

// The popup's rows: the states in ORDER, each in the order main gave them. Choosing one answers with
// its pane id. A worker whose session has used the prompt cache says whether it is still warm, from
// `caches` (the usage sweep's).
export function workerRows(workers: readonly DispatchedWorker[], caches: Readonly<Record<string, CacheUse>>, now: number): SearchRow<string>[] {
  return workers.toSorted((one, other) => ORDER.indexOf(one.status) - ORDER.indexOf(other.status)).map((worker) => {
    const cache = caches[worker.id];
    return {
      name: `${worker.project} · ${paneLabel(paneFromId(worker.id).index)}`,
      detail: [worker.waiting ?? worker.status, cache && cacheWarmth(cache, now).text, worker.about].filter(Boolean).join(' · '),
      choice: worker.id,
    };
  });
}

// A start waiting in the pane pool's queue (workers-decision-11), listed under its main's workers.
// `place` is where it stands in the whole queue, `2nd`: the cap is the app's, so other mains' entries
// ahead of it count. `about` is what `pane queue` says it starts.
export type QueuedWorker = { id: string; dispatcher: number; project: string; place: string; about: string; after: string | null };

// The popup's queued rows, in the order main gave them, which is the order they start. Keyed by the
// entry's id, which the withdraw key hands to pane.unqueue; they have no pane for Enter to go to.
export function queuedRows(queued: readonly QueuedWorker[]): { key: string; name: string; detail: string }[] {
  return queued.map((entry) => ({
    key: entry.id,
    name: `${entry.project} · ${entry.id}`,
    detail: [`${entry.place} in line`, entry.after === null ? '' : `after ${entry.after}`, entry.about].filter(Boolean).join(' · '),
  }));
}

// What the withdraw key takes on the popup's highlighted row: the queued start it is, or why not.
export function withdrawTarget(queued: readonly QueuedWorker[], rowKey: string | undefined): { id: string } | { refused: string } {
  const entry = queued.find((each) => each.id === rowKey);
  return entry === undefined
    ? { refused: 'Only a queued start is withdrawn; a running worker is released with pane release.' }
    : { id: entry.id };
}
