import type { Action } from './actions';
import { SELECTED_CARD, createBoardView, type BoardView } from './board-view';
import type { DashboardBridge } from './bridge';
import { cardsEmptyReason, cardsProjects, type CardsPage } from './cards';
import { clampIndex, heldIndex } from './clamp-index';

export type CardsOptions = {
  bridge: DashboardBridge;
  // Every open project, asked for again on every arrival. Which of them get a board is cardsProjects'
  // answer, not this one's.
  projects(): readonly CardsPage[];
  // The status bar names the project the keys are aimed at and what its selection is on, so it is
  // redrawn whenever either can change.
  onChanged(): void;
  // Which project's board is complaining, so the renderer can give each one an owner of its own. Two
  // screens read the same file — this page and that project's own tab — and neither may clear a
  // message the other put on the bar.
  onError(slot: number, message: string): void;
};

type ProjectBoard = { page: CardsPage; view: BoardView; section: HTMLElement };

// Every open project's board, one under the other, on the manager page.
//
// Not a second board: it is the real board view, once per project, so every key that edits a card
// already works here and each project keeps its own undo step and writes its own file. What this adds
// is the stacking, and which of them the keys are aimed at.
//
// It hands back a BoardView because that is what it is to everything outside: the renderer holds it in
// the same field, shows it in the same mode and calls it through the same four functions a project's
// board is called through.
export function createCardsView(options: CardsOptions): BoardView {
  const element = document.createElement('div');
  element.className = 'view view-board cards';
  // Focusable so the page still takes the keyboard with no project open, when there is no board to
  // hand it to and typing would otherwise go on reaching the manager's list behind this view.
  element.tabIndex = -1;
  const empty = document.createElement('p');
  empty.className = 'board-empty';

  // One board per project, kept between visits so a project's undo step survives leaving the page,
  // the way a project's own board keeps its. Keyed by path, which is the thing that decides which
  // file a board reads.
  const boards = new Map<string, ProjectBoard>();
  let paths: string[] = [];
  let activeIndex = 0;
  // Which board the keys reach, held as its path rather than its position: a project opening in front
  // would otherwise slide them onto somebody else's board between you reading the screen and pressing
  // a key.
  let activePath = '';

  function boardFor(page: CardsPage): ProjectBoard {
    const existing = boards.get(page.project.path);
    if (existing) return existing;
    const view = createBoardView({
      projectPath: page.project.path,
      bridge: options.bridge,
      // Only the board the keys reach can change what the status bar says. Without this every board
      // redrawing on arrival would rebuild the bar, and the tab strip with it, once per project.
      onChanged: () => {
        if (page.project.path === activePath) options.onChanged();
      },
      onError: (message) => options.onError(page.slot, message),
    });
    const section = document.createElement('section');
    section.className = 'cards-project';
    const heading = document.createElement('h2');
    heading.textContent = page.project.name;
    section.append(heading, view.element);
    const board = { page, view, section };
    boards.set(page.project.path, board);
    return board;
  }

  // The CSS turns off an inactive project's selection outline; see the .cards-project rule in
  // index.css for why only one of the stacked boards may draw one. This says which is which.
  function markActive(): void {
    for (const board of boards.values()) {
      board.section.classList.toggle('active', board.page.project.path === activePath);
    }
  }

  function setActive(index: number): void {
    activeIndex = index;
    activePath = paths[index] ?? '';
    markActive();
  }

  // The keyboard goes to the active board itself, so its own inline editors open with focus already in
  // them. With no project open there is no board to give it to and the page takes it instead.
  // Both scrolls, in that order: the project first, so its heading comes on screen, and then the card,
  // which wins where the two disagree. The card alone would leave you looking at a column with nothing
  // above it saying whose it is; the project alone would leave the selection off the bottom.
  function focusActive(): void {
    const board = boards.get(activePath);
    (board?.view.element ?? element).focus();
    board?.section.scrollIntoView({ block: 'nearest' });
    board?.section.querySelector(SELECTED_CARD)?.scrollIntoView({ block: 'nearest' });
  }

  return {
    element,
    async open(): Promise<void> {
      const openProjects = options.projects();
      const pages = cardsProjects(openProjects);
      paths = pages.map((page) => page.project.path);
      // A project that has been closed takes its board with it, or the file would go on being read and
      // drawn under a heading for a project that is no longer open.
      for (const path of [...boards.keys()]) if (!paths.includes(path)) boards.delete(path);
      const projectBoards = pages.map(boardFor);
      if (projectBoards.length === 0) {
        empty.textContent = `There are no cards to show: ${cardsEmptyReason(openProjects)}.`;
        element.replaceChildren(empty);
      } else {
        element.replaceChildren(...projectBoards.map((board) => board.section));
      }
      // Every board reads its own file, and a read that fails reports itself through its own onError
      // and still renders — so there is nothing to catch here.
      const reads = projectBoards.map((board) => board.view.open());
      setActive(heldIndex(paths, activePath, activeIndex));
      focusActive();
      // Again once the reads have landed: each board scrolls its own selected card into view as it
      // renders, and they share this scroller, so without this you arrive looking at the last project.
      await Promise.all(reads);
      focusActive();
    },
    statusLabel(): string {
      const board = boards.get(activePath);
      if (board) return `${board.page.project.name} · ${board.view.statusLabel()}`;
      return cardsEmptyReason(options.projects());
    },
    runAction(action: Action): void {
      // Which board the rest of the keys go to. The list does not wrap: holding it down stops at the
      // last project rather than carrying you back to the first.
      if (action.kind === 'cards-project') {
        const step = action.direction === 'next' ? 1 : -1;
        setActive(clampIndex(activeIndex + step, paths.length - 1));
        focusActive();
        return options.onChanged();
      }
      // Everything else is an ordinary board key, and the board it belongs to answers it exactly as it
      // would on that project's own tab.
      boards.get(activePath)?.view.runAction(action);
    },
  };
}
