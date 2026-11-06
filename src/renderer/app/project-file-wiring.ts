import type { DashboardBridge } from '../../shared/app/bridge';
import type { Page } from './page';

// A project's board, notes or handwriting written by something other than this screen. Out of
// renderer.ts at its 600-line ceiling. Only the page in front is told each time: a hidden view is read
// again in full when you arrive at it, so it has nothing to redraw now.

export type ProjectFilePorts = {
  bridge: Pick<DashboardBridge, 'onBoardChange' | 'onNotesChange' | 'onInkChange'>;
  activePage(): Page;
};

export function createProjectFileWiring({ bridge, activePage }: ProjectFilePorts): void {
  // The `board` command an agent runs, or a hand edit. The manager's stack of boards is one of these
  // too, and finds the project the path belongs to itself.
  bridge.onBoardChange((projectPath) => {
    const page = activePage();
    if (page.mode !== 'board') return;
    page.board?.reload(projectPath);
  });

  // Another screen wrote a page of notes. The box in front reads its file again if the page is its own,
  // keeping anything typed here that has not been written yet.
  bridge.onNotesChange((projectPath) => {
    const page = activePage();
    if (page.mode === 'notes') void page.notes?.reload(projectPath);
  });

  // The same for the handwriting page, which has its own file and its own message.
  bridge.onInkChange((projectPath) => {
    const page = activePage();
    if (page.mode === 'notes' && page.inkShowing) void page.ink?.reload(projectPath);
  });
}
