import type { OpenProjects } from './bridge';
import { isProjectPage } from './manager';
import { discardPanes, type Page } from './page';
import { hostTracker, landingAfterMoves } from './page-reconcile';
import type { Project } from './projects';

// What the renderer hands over: its live list of pages, the tab it is on, and the few things that put
// a page on screen. Functions rather than values, since the list and the tab change between calls.
export type PageSyncPorts = {
  pages(): Page[];
  positionOfSlot(slot: number | null): number;
  projectPages(): Page[];
  activeIndex(): number;
  setPage(project: Project, slot: number, open: readonly number[]): void;
  // Makes a page's terminals the ones the list says it has open.
  syncPanes(page: Page, open: readonly number[]): void;
  landOn(index: number): void;
  // Moves the tab marker to a page that shifted, without arriving on it.
  follow(index: number): void;
  renderStatus(): void;
  // Back from another host: `rebuild` puts this machine's pages back bare, and the renderer runs it with
  // saving held off until it has put their views, focus and names back.
  comeHome(rebuild: () => void): void;
  onProjectsChange(listener: (open: OpenProjects) => void): void;
  onHostChange(listener: (host: string) => void): void;
};

export type PageSync = {
  removePage(slot: number): void;
  applyProjects(open: OpenProjects): void;
  // Which host the pages on screen were built from; LOCAL_SCREEN for this machine's own.
  host(): string;
};

export function createPageSync(ports: PageSyncPorts): PageSync {
  const hosts = hostTracker();
  const { positionOfSlot, projectPages } = ports;

  // Drops what a project's page holds: its panes and its board.
  function discardPage(page: Page): void {
    discardPanes(page.slot);
    page.board?.close();
  }

  // Takes a project's page off the screen and out of the list. What the close key does after main has
  // agreed, and what applyProjects does for a project another screen closed.
  function removePage(slot: number): void {
    const page = ports.pages()[positionOfSlot(slot)];
    if (!page || !isProjectPage(page)) return;
    discardPage(page);
    page.element.remove();
    ports.pages().splice(positionOfSlot(slot), 1);
  }

  // The host's list of open projects, made true on this screen. Pages that already match are left
  // alone, which is what lets the push and the reply to our own open both carry the list.
  function applyProjects(open: OpenProjects): void {
    const pages = ports.pages();
    const standingSlot = pages[ports.activeIndex()]?.slot ?? null;
    const current = projectPages().map((page) => ({ slot: page.slot, project: page.project }));
    const { moves, home } = hosts.movesFor(current, open);
    const apply = (): void => {
      for (const move of moves) {
        if (move.kind === 'remove') removePage(move.slot);
        else {
          // A rebuild replaces the page where it stands, so the old one is only emptied, not taken out.
          if (move.kind === 'rebuild') discardPage(pages[positionOfSlot(move.slot)]);
          ports.setPage(move.project, move.slot, open.panes[move.slot] ?? []);
        }
      }
      // A worker opening or closing changes no page, only what is on one. Every page is asked, since
      // the list does not say which changed; one that already matches is left as it is.
      for (const page of projectPages()) ports.syncPanes(page, open.panes[page.slot] ?? []);
      const landing = landingAfterMoves(standingSlot, moves, positionOfSlot, ports.activeIndex(), pages.length);
      if (landing.takeFocus) ports.landOn(landing.position);
      else {
        // Removals ahead of the page shift it along; follow it without taking its focus, and keep the
        // pages this call built out of sight.
        pages.forEach((page, index) => { page.element.hidden = index !== landing.position; });
        ports.follow(landing.position);
      }
      ports.renderStatus();
    };
    if (home) ports.comeHome(apply);
    else apply();
  }
  ports.onProjectsChange(applyProjects);
  ports.onHostChange(hosts.change);

  return { removePage, applyProjects, host: hosts.host };
}
