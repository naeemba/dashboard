import type { DashboardBridge } from '../../shared/app/bridge';
import type { Page } from '../app/page';

// A page of notes, or the handwriting page, written by another screen. Out of renderer.ts at its
// 600-line ceiling. Only the page showing is told: a hidden one reads when you arrive at it.

export type NotesWiringPorts = {
  bridge: Pick<DashboardBridge, 'onNotesChange' | 'onInkChange'>;
  activePage(): Page;
};

export function createNotesWiring({ bridge, activePage }: NotesWiringPorts): void {
  // The box in front reads its file again if the page is its own, keeping anything typed here that has
  // not been written yet.
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
