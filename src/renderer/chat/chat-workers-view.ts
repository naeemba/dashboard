import { failureText } from '../../shared/errors/failure';
import type { DashboardBridge } from '../../shared/app/bridge';
import { matchesBinding } from '../../shared/keys/binding';
import { queuedRows, workerCount, workerRows, type DispatchedWorker, type QueuedWorker } from '../../shared/workers/worker-roster';
import { anchoredPopup } from '../app/anchored-popup';
import { piece } from './chat-foot-view';
import type { UsageSnapshot } from '../../shared/usage/usage';

// Every main's workers and the pane pool's queue, kept current for the Claude screens' status lines
// and the workers popup. What is counted and how the rows read is worker-roster.ts's; this only asks
// main and draws.

// A worker's hooks mark its pane, a claim, a run, a release or a pane closing changes the open list,
// and a terminal worker's agent exiting ends its pane's shell, which main says after it has stopped
// counting the agent; the queue says when it changes: those four events are every change there is.
// One read per change serves every page: each watcher picks out its own slot's.
const watchers = new Set<() => void>();
let roster: DispatchedWorker[] = [];
let queue: QueuedWorker[] = [];
// Each pane's last use of the prompt cache, from the usage sweep, for the popup's warm or cold.
let caches: UsageSnapshot['caches'] = {};
let listening = false;

const ofSlot = (slot: number): DispatchedWorker[] => roster.filter((worker) => worker.dispatcher === slot);
const queuedOf = (slot: number): QueuedWorker[] => queue.filter((entry) => entry.dispatcher === slot);

function tellWatchers(): void {
  for (const each of watchers) each();
}

function read(bridge: DashboardBridge): void {
  bridge.workers().then((list) => {
    roster = list;
    tellWatchers();
  }, () => undefined);
}

// Apart from the roster: a hook marks a pane far more often than the queue changes.
function readQueue(bridge: DashboardBridge): void {
  bridge.workerQueue().then((queued) => {
    queue = queued;
    tellWatchers();
  }, () => undefined);
}

function watch(bridge: DashboardBridge, changed: () => void): () => void {
  if (!listening) {
    listening = true;
    bridge.onPaneMark(() => read(bridge));
    // A page opening or closing also changes which slot an entry's main is on.
    bridge.onProjectsChange(() => { read(bridge); readQueue(bridge); });
    bridge.onWorkerQueueChange(() => readQueue(bridge));
    // Only a listed worker's pane: a plain shell or nvim ending changes nothing here.
    bridge.onExit((id) => { if (roster.some((worker) => worker.id === id)) read(bridge); });
    const takeCaches = (usage: UsageSnapshot) => {
      caches = usage.caches;
      tellWatchers();
    };
    bridge.onUsageChange(takeCaches);
    bridge.readUsage().then(takeCaches, () => undefined);
  }
  watchers.add(changed);
  return () => watchers.delete(changed);
}

// The page's status line count, workers and queued starts, with `drawn` told it now and on every
// change. The bridge's listeners cannot be taken off, so a screen whose page was rebuilt stays in the set.
// ponytail: never removed, one stale entry per page rebuild; add a dispose to the chat view when
// rebuilds get frequent.
export function followWorkers(bridge: DashboardBridge, slot: number, drawn: (count: string) => void): void {
  watch(bridge, () => drawn(workerCount(ofSlot(slot), queuedOf(slot).length)));
  read(bridge);
  readQueue(bridge);
}

export type WorkersPopup = {
  bridge: DashboardBridge;
  slot: number;
  anchor: HTMLElement;
  // The withdraw key as the settings have it, which the popup matches itself (the `workers` scope).
  withdrawKey: () => string | null;
  goToPane(id: string): void;
  // What a withdrawal answered, or why it failed.
  onNotice(message: string): void;
};

// The popup, just above the count: one row per worker, arrows walk them, Enter lands on the pane,
// Escape closes; then the starts this page's main queued, in the order they start, which the withdraw
// key takes out through pane.unqueue. Its rows follow the same reads while it is open, so a worker
// finishing or an entry starting shows without closing it.
export async function showWorkers(popup: WorkersPopup): Promise<boolean> {
  const { bridge, slot } = popup;
  const cells = (row: { name: string; detail: string }) => [piece('search-name', row.name), piece('search-detail', row.detail)];
  const id = await anchoredPopup({
    name: 'chat-workers', anchor: popup.anchor,
    heading: () => {
      const count = workerCount(ofSlot(slot), queuedOf(slot).length);
      return count ? `${count} · Enter goes to one` : 'No worker is open';
    },
    sections: () => {
      const queued = queuedOf(slot);
      return [{
        title: null,
        rows: workerRows(ofSlot(slot), caches, Date.now()).map((row) => ({
          key: row.choice, choice: row.choice, cells: cells(row),
        })),
      }, ...(queued.length === 0 ? [] : [{
        title: 'Queued',
        rows: queuedRows(queued).map((row) => ({ key: row.key, cells: cells(row) })),
      }])];
    },
    rowKey(event, row) {
      if (!matchesBinding(event, popup.withdrawKey())) return false;
      if (row === undefined || !queuedOf(slot).some((each) => each.id === row)) {
        popup.onNotice('Only a queued start is withdrawn; a running worker is released with pane release.');
        return true;
      }
      bridge.unqueueWorker(slot, row).then(
        (answer) => popup.onNotice('refused' in answer ? answer.refused : answer.output),
        (error: unknown) => popup.onNotice(`${row} not withdrawn: ${failureText(error)}`),
      );
      return true;
    },
    watch: (changed) => watch(bridge, changed),
  });
  if (id !== undefined) popup.goToPane(id);
  return id !== undefined;
}
