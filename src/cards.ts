import type { Project } from './projects';

// A page as the manager's board needs it, which is what the renderer already holds one as.
export type CardsPage = { project: Project; slot: number };

// Which of the open projects get a board on the manager, and so which boards are kept: any board not
// in this list is one whose project has gone and is dropped.
//
// A project whose folder has gone has no board.json to read and no page behind it either, so a
// heading for it would be a section you cannot do anything with.
export function cardsProjects(pages: readonly CardsPage[]): CardsPage[] {
  return pages.filter((page) => !page.project.missing);
}

// Why there is nothing to show, said as a fragment both the empty page and the status bar build on.
// Two ways to get here and they are not the same answer: a project whose folder has gone keeps its
// tab, so "no project is open" would be denied by that project's own name in the strip above.
export function cardsEmptyReason(pages: readonly CardsPage[]): string {
  return pages.length > 0 && pages.every((page) => page.project.missing)
    ? 'every open project has lost its folder'
    : 'no project is open';
}
