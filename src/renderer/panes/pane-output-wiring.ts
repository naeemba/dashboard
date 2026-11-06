import type { DashboardBridge } from '../../shared/app/bridge';
import { WORKING_REPORT_MS } from '../../shared/panes/working-panes';
import { panesById, setPaneTitle } from '../app/page';
import { paneLooksBusy } from './pane';

// What a pane's process sends back: its output, its exit, and whether an agent is still working in it.
// Out of renderer.ts at its 600-line ceiling; every pane is found through panesById, so nothing here
// needs to know which page is in front.

export type PaneOutputPorts = {
  bridge: Pick<DashboardBridge, 'onData' | 'onExit' | 'reportWorkingPanes'>;
  renderStatus(): void;
};

export function createPaneOutputWiring({ bridge, renderStatus }: PaneOutputPorts): void {
  bridge.onData((id, data) => {
    const pane = panesById.get(id);
    if (!pane) return;
    pane.lastPrintedAt = Date.now();
    pane.flow.queued(data.length);
    pane.terminal.write(data, () => pane.flow.parsed(data.length));
  });

  // Telling main which panes have an agent still working in them. It cannot see this for itself: it holds
  // the pty and so knows a process is there, and the pane runs `exec claude`, which sits at its prompt
  // when the card is done rather than exiting. The review sweep is what needs the answer — it takes a
  // card's worktree away, and `git worktree remove` kills every shell in that folder — and without this
  // it waits on an exit that only arrives when you close the pane by hand, so no review ever starts.
  //
  // paneLooksBusy is the reading, and it is the screen's, not main's — the one question about a pane
  // that a foreground process cannot answer, which is why it goes this way round while "is anything
  // running in this pane" goes the other. One report is a sample and not an answer, and what main makes
  // of a run of them is working-panes.ts's, which is also where the interval below comes from — the same
  // number the sweep that reads the reports ticks on, written once so halving one halves the other.
  //
  // Every pane, including the ones no card was ever shipped into, because working out which pane a
  // worktree record names means pairing its project with a slot and that pairing is main's. The cost is
  // one screen laid out per pane per five seconds; if it ever shows, the narrowing is to report only the
  // panes the records name.
  window.setInterval(() => {
    const working: string[] = [];
    for (const [id, pane] of panesById) if (paneLooksBusy(pane)) working.push(id);
    bridge.reportWorkingPanes(working);
  }, WORKING_REPORT_MS);

  bridge.onExit((id, exitCode) => {
    const pane = panesById.get(id);
    if (!pane) return;
    pane.exited = true;
    // The title dies with the program that set it, which is here. Left standing, the bar names a file
    // nothing has open: quit nvim and the pane still reads `nvim · board.json` until you press Enter and
    // the next nvim prints its own. A typed name is untouched — that one is yours and survives a restart.
    setPaneTitle(pane, undefined);
    pane.terminal.write(`\r\n[exited ${exitCode}] press Enter to restart\r\n`);
    // The pane says so to whoever is looking at it; this is what tells the manager, which is where you
    // find out about a pane on a project you are not on.
    renderStatus();
  });
}
