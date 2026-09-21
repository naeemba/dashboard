import type { CardsPage } from './cards';
import { createCardsView } from './cards-view';
import { createCommandView } from './command-view';
import type { DashboardBridge } from './bridge';
import type { SendPlan } from './free-pane';
import { MANAGER_PROJECT, MANAGER_SLOT } from './manager';
import { createManagerView } from './manager-view';
import type { Mode } from './modes';
import { createNotesView } from './notes-view';
import { showMode, type Page } from './page';
import { createSectionStrip } from './section-strip';
import type { WorktreeEntry } from './worktree-store';

// The one page with no folder behind it, so none of what page.ts's builder makes: no shells and no
// editor. It has four views — the list of what every project's panes want, every project's board, the
// command screen, and a page of notes — and the mode keys for the two it does not have do nothing
// here.
//
// Its board is a board like any other as far as the renderer is concerned: same field, same mode,
// same four functions. What is behind it is one real board per open project rather than one for a
// folder. Its notes are the same trick again: the same view a project has, over the one path that
// names no project, which notes-store reads as the home directory.
//
// Out of renderer.ts beside page.ts and for the same reason: that file reached its 600-line ceiling
// again, and a page builder is the seam it had already been split along once. What is left there is
// the plumbing — which page is in front, what the status bar says — and neither builder is any of it.

export type ManagerPageOptions = {
  // Handed over like everything else here rather than read off the window, so nothing in this file
  // reaches for a global.
  bridge: DashboardBridge;
  // Every open project and the page it is on, read on every arrival rather than handed over once, so
  // a project opened since you were last here has a board and a row.
  projects(): readonly CardsPage[];
  // A ship leaves a new worktree behind, and the board's badges are drawn from the list of them.
  worktrees(): readonly WorktreeEntry[];
  // What a key is bound to now, so the command screen's prompt names the key in force rather than a
  // copy taken when the page was built.
  binding(actionName: string): string;
  // Redraws the status bar and, when it is in front, the manager's list.
  onChanged(): void;
  // The status bar's error span, which only the owner that wrote a message may clear.
  onError(owner: string, message: string): void;
  // The four things the renderer alone can do: land on a pane, answer one, close a project, and show
  // another section of this page. Their shapes are the views' own — this file passes them straight
  // through rather than putting a second spelling of each in front of the ones over in manager-view.
  onJump(slot: number, index: number): void;
  onAnswer(slot: number, index: number, key: string): void;
  onClose(slot: number): void;
  onSection(mode: Mode): void;
  // One typed command across the marked projects: as its own process, or typed into a free pane. The
  // second answers with what it did to each — which panes took the line and which had none free — and
  // the command screen is what says so.
  runTask(command: string, projectPaths: string[]): void;
  runInPanes(command: string, projectPaths: string[]): Promise<SendPlan>;
  cancelTasks(): void;
};

export function createManagerPage(options: ManagerPageOptions): Page {
  const element = document.createElement('section');
  // The modifier is what index.css uses to push this page's views down below the section strip —
  // a project's page has no strip, so it keeps the plain .page rule and needs none of that.
  element.className = 'page page-manager';
  const manager = createManagerView({
    onJump: options.onJump,
    onAnswer: options.onAnswer,
    onClose: options.onClose,
    onChanged: options.onChanged,
  });
  const cards = createCardsView({
    bridge: options.bridge,
    projects: options.projects,
    onChanged: options.onChanged,
    // A slot each, and a different owner from the same project's own board, so the two screens reading
    // one file never clear each other's message.
    onError: (slot, message) => options.onError(`cards:${slot}`, message),
    worktrees: options.worktrees,
  });
  const command = createCommandView({
    projects: () => options.projects().map((entry) => ({
      name: entry.project.name, path: entry.project.path,
    })),
    runTask: options.runTask,
    runInPanes: options.runInPanes,
    cancelTasks: options.cancelTasks,
    binding: options.binding,
    onChanged: options.onChanged,
  });
  const notes = createNotesView({
    bridge: options.bridge,
    // The manager page's own path, which is empty because the page has no folder. notes-store is
    // where that is read as the home directory, and handing it the page's path rather than an empty
    // string written out here is what keeps this file from holding a second copy of that rule.
    projectPath: MANAGER_PROJECT.path,
    placeholder: 'Notes about no project in particular. Saved to .dashboard/notes.md in your home '
      + 'folder as you type.',
    // A slot of its own, like every project's, so the manager's notes never clear a project's failure
    // or have one cleared by it. MANAGER_SLOT is a number no project is ever given.
    onError: (message) => options.onError(`notes:${MANAGER_SLOT}`, message),
  });
  // The notes view is the box and nothing else, so the wrapper a project's page builds in page.ts is
  // built here too: `.view` is what the stylesheet positions and hides, and `.page-manager .view` is
  // what pushes it down below the strip.
  const notesView = document.createElement('div');
  notesView.className = 'view view-notes';
  notesView.append(notes.element);
  // Above the four views rather than inside one, so it is on screen whichever section is showing.
  const strip = createSectionStrip(options.onSection);
  element.append(strip.element, manager.element, cards.element, command.element, notesView);
  const page: Page = {
    project: MANAGER_PROJECT, element,
    views: {
      manager: manager.element, board: cards.element, command: command.element, notes: notesView,
    },
    mode: 'manager', panes: [], focused: 0, slot: MANAGER_SLOT, editor: null, editorStarted: false,
    board: cards, notes, manager, command, strip,
  };
  // Which view is on screen and which mode the page is in are one fact, and showMode is where they are
  // set together — including here, where the page has not been arrived at yet.
  showMode(page, 'manager');
  return page;
}
