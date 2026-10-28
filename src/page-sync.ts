import type { OpenProjects } from './bridge';
import { isProjectPage } from './manager';
import { discardPanes, type Page } from './page';
import { pageMoves } from './page-reconcile';
import type { Project } from './projects';

// What the renderer hands over: its live list of pages, the tab it is on, and the few things that put
// a page on screen. Functions rather than values, since the list and the tab change between calls.
export type PageSyncPorts = {
  pages(): Page[];
  activeIndex(): number;
  setPage(project: Project, slot: number): void;
  landOn(index: number): void;
  // Moves the tab marker to a page that shifted, without arriving on it.
  follow(index: number): void;
  renderStatus(): void;
  onProjectsChange(listener: (open: OpenProjects) => void): void;
};

export type PageSync = {
  removePage(slot: number): void;
  applyProjects(open: OpenProjects): void;
};

export function createPageSync(ports: PageSyncPorts): PageSync {
  // Which host's list the pages were built from. A different one means none of them belong here.
  let currentHost = 'local';
  const positionOfSlot = (slot: number | null): number => ports.pages().findIndex((page) => page.slot === slot);
  const projectPages = (): Page[] => ports.pages().filter(isProjectPage);

  // Takes a project's page off the screen and out of the list. What the close key does after main has
  // agreed, and what applyProjects does for a project another screen closed.
  function removePage(slot: number): void {
    const position = positionOfSlot(slot);
    const page = ports.pages()[position];
    if (!page || !isProjectPage(page)) return;
    discardPanes(slot);
    page.board?.close();
    page.element.remove();
    ports.pages().splice(position, 1);
  }

  // The host's list of open projects, made true on this screen. Pages that already match are left
  // alone, which is what lets the push and the reply to our own open both carry the list.
  function applyProjects(open: OpenProjects): void {
    const pages = ports.pages();
    const standing = pages[ports.activeIndex()];
    const current = projectPages().map((page) => ({ slot: page.slot, project: page.project }));
    for (const move of pageMoves(current, currentHost, open)) {
      if (move.kind === 'reset') for (const page of projectPages()) removePage(page.slot);
      else if (move.kind === 'remove') removePage(move.slot);
      else ports.setPage(move.project, move.slot);
    }
    currentHost = open.host;
    const position = positionOfSlot(standing?.slot ?? null);
    if (pages[position] !== standing) {
      // The page you stood on went or was rebuilt: land on whatever took its tab, or the tab to its
      // left at the end of the list, which is the manager at worst.
      ports.landOn(position === -1 ? Math.min(ports.activeIndex(), pages.length - 1) : position);
    } else {
      // Removals ahead of the page shift it along; follow it without taking its focus, and keep the
      // pages this call built out of sight.
      pages.forEach((page, index) => { page.element.hidden = index !== position; });
      ports.follow(position);
    }
    ports.renderStatus();
  }
  ports.onProjectsChange(applyProjects);

  return { removePage, applyProjects };
}
