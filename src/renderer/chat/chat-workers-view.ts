import type { DashboardBridge } from '../../shared/app/bridge';
import { workerCount, workerRows, type DispatchedWorker } from '../../shared/workers/worker-roster';
import { anchoredPopup } from '../app/anchored-popup';
import { piece } from './chat-foot-view';
import type { UsageSnapshot } from '../../shared/usage/usage';

// Every main's workers, kept current for the Claude screens' status lines and the workers popup. What
// is counted and how the rows read is worker-roster.ts's; this only asks main and draws.

// A worker's hooks mark its pane, a claim, a run, a release or a pane closing changes the open list,
// and a terminal worker's agent exiting ends its pane's shell, which main says after it has stopped
// counting the agent: those three events are every change there is. One read per change serves every
// page: each watcher picks out its own slot's workers.
const watchers = new Set<() => void>();
let roster: DispatchedWorker[] = [];
// Each pane's last use of the prompt cache, from the usage sweep, for the popup's warm or cold.
let caches: UsageSnapshot['caches'] = {};
let listening = false;

const ofSlot = (slot: number): DispatchedWorker[] => roster.filter((worker) => worker.dispatcher === slot);

function tellWatchers(): void {
  for (const each of watchers) each();
}

function read(bridge: DashboardBridge): void {
  bridge.workers().then((list) => {
    roster = list;
    tellWatchers();
  }, () => undefined);
}

function watch(bridge: DashboardBridge, changed: () => void): () => void {
  if (!listening) {
    listening = true;
    bridge.onPaneMark(() => read(bridge));
    bridge.onProjectsChange(() => read(bridge));
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

// The page's workers, with `drawn` told them now and on every change. The bridge's listeners cannot
// be taken off, so a screen whose page was rebuilt stays in the set.
// ponytail: never removed, one stale entry per page rebuild; add a dispose to the chat view when
// rebuilds get frequent.
export function followWorkers(bridge: DashboardBridge, slot: number, drawn: (workers: DispatchedWorker[]) => void): void {
  watch(bridge, () => drawn(ofSlot(slot)));
  read(bridge);
}

// The popup, just above `anchor`, the count: one row per worker, arrows walk them, Enter lands on
// the pane, Escape closes. Its rows follow the same roster while it is open, so a worker finishing
// shows without closing it.
export async function showWorkers(bridge: DashboardBridge, slot: number, anchor: HTMLElement, goToPane: (id: string) => void): Promise<boolean> {
  const id = await anchoredPopup({
    name: 'chat-workers', anchor,
    heading: () => {
      const count = workerCount(ofSlot(slot));
      return count ? `${count} · Enter goes to one` : 'No worker is open';
    },
    sections: () => [{
      title: null,
      rows: workerRows(ofSlot(slot), caches, Date.now()).map((row) => ({
        key: row.choice, choice: row.choice, cells: [piece('search-name', row.name), piece('search-detail', row.detail)],
      })),
    }],
    watch: (changed) => watch(bridge, changed),
  });
  if (id !== undefined) goToPane(id);
  return id !== undefined;
}
