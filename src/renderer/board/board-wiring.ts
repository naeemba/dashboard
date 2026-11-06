import type { DashboardBridge } from '../../shared/app/bridge';
import type { Page } from '../app/page';

// The board's files written by something other than this screen — the `board` command an agent runs,
// or a hand edit. Out of renderer.ts at its 600-line ceiling. Only the page in front is told: a hidden
// board is re-read in full when you arrive at it, and a board that is not on screen has nothing to
// redraw. The manager's stack of boards is one of these too, and finds the project the path belongs to
// itself.

export type BoardWiringPorts = {
  bridge: Pick<DashboardBridge, 'onBoardChange'>;
  activePage(): Page;
};

export function createBoardWiring({ bridge, activePage }: BoardWiringPorts): void {
  bridge.onBoardChange((projectPath) => {
    const page = activePage();
    if (page.mode !== 'board') return;
    page.board?.reload(projectPath);
  });
}
