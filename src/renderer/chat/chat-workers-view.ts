import type { DashboardBridge } from '../../shared/app/bridge';
import { workerRows, type DispatchedWorker } from '../../shared/workers/worker-roster';
import { searchOverlay } from '../app/overlay';

// The workers a page's main ran, kept current for its status line and the workers popup. What is
// counted and how the rows read is worker-roster.ts's; this only asks main and draws.

// A worker's hooks mark its pane, and a claim, a release or a pane closing changes the open list, so
// those two are every change there is but an agent exiting, which shows on the next of them.
// ponytail: an exit alone does not refresh; add a main-side event if idle needs to show at once.
const watchers = new Set<() => void>();
let listening = false;

function watch(bridge: DashboardBridge, changed: () => void): () => void {
  if (!listening) {
    listening = true;
    const everyone = () => { for (const each of watchers) each(); };
    bridge.onPaneMark(everyone);
    bridge.onProjectsChange(everyone);
  }
  watchers.add(changed);
  return () => watchers.delete(changed);
}

// The page's roster, read now and again on every change, with `drawn` told each time. A screen whose
// page was rebuilt stays in the set and asks for nothing once it is off the window.
// ponytail: never removed, which is one stale entry per page rebuild; add a dispose to the chat view
// when rebuilds get frequent.
export function followWorkers(bridge: DashboardBridge, slot: number, element: HTMLElement, drawn: (workers: DispatchedWorker[]) => void): void {
  const read = (): void => void bridge.workers(slot).then(drawn, () => undefined);
  watch(bridge, () => { if (element.isConnected) read(); });
  read();
}

// The popup: one row per worker, arrows walk them, Enter lands on the pane, Escape closes. It reads
// main again on every change while it is open, so a worker finishing shows without closing it.
export async function showWorkers(bridge: DashboardBridge, slot: number, goToPane: (id: string) => void): Promise<boolean> {
  let workers = await bridge.workers(slot);
  const id = await searchOverlay({
    name: 'chat-workers', placeholder: 'Search this session\'s workers', empty: 'No worker of this session is open.',
    rows: (query) => workerRows(workers, query), glyph: () => 'claude',
    watch: (changed) => watch(bridge, () => void bridge.workers(slot).then((list) => {
      workers = list;
      changed();
    }, () => undefined)),
  });
  if (id !== undefined) goToPane(id);
  return id !== undefined;
}
