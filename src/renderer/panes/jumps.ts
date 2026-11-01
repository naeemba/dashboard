import type { Need } from './needs-you';
import { showMode, type Page } from './page';
import { modeOfPane } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// The ways to be sent somewhere you are not: a notification click, Enter on a row in the manager or
// the worktree list, and the key that takes you to the next thing waiting on you. One place, so none
// of them lands somewhere another would not — including on the right view.
export type JumpPorts = {
  // The renderer's live list, asked each time, since projects open and close between jumps.
  pages(): readonly Page[];
  showPage(position: number, arriving: boolean): void;
};

export type Jumps = {
  goToPane(slot: number, index: number): void;
  // These two hand back a sentence saying why they could not land, or '' when they did.
  jumpToWorktree(entry: WorktreeEntry): string;
  // An item on the manager's queue, wherever it points.
  jumpToNeed(need: Need): string;
};

export function createJumps(ports: JumpPorts): Jumps {
  function goToPane(slot: number, index: number): void {
    const pages = ports.pages();
    const position = pages.findIndex((page) => page.slot === slot);
    if (position === -1) return;
    const page = pages[position];
    const mode = modeOfPane(index);
    showMode(page, mode);
    // The editor is not one of the grid's five, so it has no place in `focused`: nvim is the whole view.
    if (mode === 'terminals') page.focused = index;
    ports.showPage(position, true);
  }

  // Two rows have nowhere to send you, and both say so rather than looking like a key that did
  // nothing: a worktree with no pane is one whose ship found every pane in use, or one the app has
  // restarted since, and a project closed since its card shipped has no page to land on. Neither
  // opens anything on your behalf — this is "take me there", not "start it".
  function jumpToWorktree(entry: WorktreeEntry): string {
    if (entry.pane === null) return `${entry.branch} has no pane — nothing of it is running`;
    const page = ports.pages().find((candidate) => candidate.project.path === entry.projectPath);
    if (!page) return `${entry.branch} is in a project that is not open`;
    goToPane(page.slot, entry.pane);
    return '';
  }

  // The project's board, with the selection on the card. The board is read on arrival, so the card is
  // picked once that read lands rather than now.
  function jumpToCard(projectPath: string, cardId: string): string {
    const pages = ports.pages();
    const position = pages.findIndex((page) => page.project.path === projectPath);
    const page = pages[position];
    if (!page?.board) return 'That project is not open';
    page.board.aimAt(cardId);
    showMode(page, 'board');
    ports.showPage(position, true);
    return '';
  }

  function jumpToNeed(need: Need): string {
    const { target } = need;
    if (target.kind === 'card') return jumpToCard(need.projectPath, target.cardId);
    goToPane(need.slot, target.index);
    return '';
  }

  return { goToPane, jumpToWorktree, jumpToNeed };
}
