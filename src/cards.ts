import { MANAGER_PROJECT, MANAGER_SLOT } from './manager';
import type { Project } from './projects';

// A page as the manager's board needs it, which is what the renderer already holds one as.
export type CardsPage = { project: Project; slot: number };

// The manager's own board, for the tasks that belong to no one project. Its path is the manager page's
// own, which dashboard-folder.ts reads as the home directory.
const MANAGER_CARDS: CardsPage = { project: MANAGER_PROJECT, slot: MANAGER_SLOT };

// Which boards the manager's board screen stacks, and so which are kept: any board not in this list is
// one whose project has gone and is dropped.
//
// The manager's own comes first and is always there, so the screen is never empty — with no project
// open it is the one board left. A project whose folder has gone has no board.json to read and no page
// behind it either, so a heading for it would be a section you cannot do anything with.
export function cardsProjects(pages: readonly CardsPage[]): CardsPage[] {
  return [MANAGER_CARDS, ...pages.filter((page) => !page.project.missing)];
}
