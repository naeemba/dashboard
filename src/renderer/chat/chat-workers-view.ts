import type { DashboardBridge } from '../../shared/app/bridge';
import { workerRows, type DispatchedWorker } from '../../shared/workers/worker-roster';
import { searchOverlay } from '../app/overlay';

// Every main's workers, kept current for the Claude screens' status lines and the workers popup. What
// is counted and how the rows read is worker-roster.ts's; this only asks main and draws.

// A worker's hooks mark its pane, and a claim, a run, a release or a pane closing changes the open
// list, so those two events are every change there is but an agent exiting, which shows on the next
// of them. One read per change serves every page: each watcher picks out its own slot's workers.
// ponytail: an exit alone does not refresh; add a main-side event if idle needs to show at once.
const watchers = new Set<() => void>();
let roster: DispatchedWorker[] = [];
let listening = false;

const ofSlot = (slot: number): DispatchedWorker[] => roster.filter((worker) => worker.dispatcher === slot);

function read(bridge: DashboardBridge): void {
  bridge.workers().then((list) => {
    roster = list;
    for (const each of watchers) each();
  }, () => undefined);
}

function watch(bridge: DashboardBridge, changed: () => void): () => void {
  if (!listening) {
    listening = true;
    bridge.onPaneMark(() => read(bridge));
    bridge.onProjectsChange(() => read(bridge));
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

// The popup: one row per worker, arrows walk them, Enter lands on the pane, Escape closes. Its rows
// follow the same roster while it is open, so a worker finishing shows without closing it.
export async function showWorkers(bridge: DashboardBridge, slot: number, goToPane: (id: string) => void): Promise<boolean> {
  const id = await searchOverlay({
    name: 'chat-workers', placeholder: 'Search this session\'s workers', empty: 'No worker of this session is open.',
    rows: (query) => workerRows(ofSlot(slot), query), glyph: () => 'claude',
    watch: (changed) => watch(bridge, changed),
  });
  if (id !== undefined) goToPane(id);
  return id !== undefined;
}
