import type { Page } from './page';
import type { PaneUse } from '../../shared/panes/pane-reading';
import { closeRefusal, type ClosingPane } from '../../shared/panes/close-refusal';
import { isProjectPage, positionAfterClose } from '../../shared/manager/manager';

// The close key's flow. Whether the project may go, and the sentence saying why not, are
// close-refusal.ts's; this asks it before it closes anything and again with the answer to the question.

// The readings main answers with, paired with the names the page has for its panes by pane number:
// workers come and go, so neither list's positions are pane numbers. A reading with no name is left
// out, and so is a name with no reading — the page names its editor, which main does not read, and a
// page whose folder has gone has no panes and no editor at all.
//
// What leaving a reading out costs, if this reached for a name that is not there instead: press Ctrl+Q
// on a page reading `Directory not found: /work/api` and the promise nobody awaits rejects, and the
// close stops before the dialog — no refusal in the status bar, no question, no page removed. That key
// is the only way to take a dead page off the tab strip.
export function closingPanes(
  uses: readonly PaneUse[],
  names: readonly { index: number; name: string }[],
): ClosingPane[] {
  const byIndex = new Map(names.map((named) => [named.index, named.name]));
  return uses.flatMap((use) => {
    const name = byIndex.get(use.index);
    return name === undefined ? [] : [{ ...use, name }];
  });
}

// What the close flow needs from renderer.ts, which owns the page list and the screen. Handed in rather
// than imported so this file stays a module the tests can load: the overlay and the page are DOM.
export type ProjectCloserPorts = {
  readPanes: (projectPath: string) => Promise<PaneUse[]>;
  closeProject: (slot: number) => void;
  // A function, since the list changes between calls: the closer reads it again after removePage.
  pages: () => readonly Page[];
  positionOfSlot: (slot: number) => number;
  activeIndex: () => number;
  namedPanes: (page: Page) => { index: number; name: string }[];
  showNotice: (owner: string, message: string) => void;
  confirm: (message: string, keysLine: string) => Promise<boolean>;
  showPage: (index: number) => void;
  removePage: (slot: number) => void;
  landOn: (index: number) => void;
  renderStatus: () => void;
};

export function createProjectCloser(ports: ProjectCloserPorts): (slot: number) => Promise<void> {
  // Whether a close is already waiting on main for the panes it would take. closeProject says what a
  // second one costs.
  let closing = false;

  // Asked twice — once before the question and once with the answer — so it is one function. What the
  // flags catch and what the sentence says are closeRefusal's; the reading itself is main's, over
  // `panes:read`, and this only puts the names to it.
  //
  // The terminals, not the editor — which is a change, and a deliberate one. The editor pane runs nvim
  // for as long as the project is open, so on a reading of what the pty has in the foreground it is busy
  // from launch, and a close that counted it would refuse every time with `nvim` named as the thing in
  // the way. It was never much of a signal on the old reading either: it blocked a close only while its
  // bell was ringing or its screen happened to match an agent's spinner. What guards a half-finished
  // edit in nvim is the question below, which is asked whether or not anything is in the way.
  async function closeRefusalFor(page: Page): Promise<string> {
    const uses = await ports.readPanes(page.project.path);
    return closeRefusal(page.project.name, closingPanes(uses, ports.namedPanes(page)));
  }

  // Closing a project: the one you are on, or the one the manager's list is pointing at. Everything it
  // takes is gone for good — its shells, the editor, and whatever was running in them — so what can stop
  // it, and the sentence saying so, are closeRefusal's. A pane that has exited or is sitting at a
  // prompt stops nothing, so the question below is asked whether or not anything was in the way.
  // The slot is not given to anyone else afterwards: main hands out a new one per project opened, so a
  // pane id that named this project names nothing from here on.
  return async function closeProject(slot: number): Promise<void> {
    // One close at a time, the same guard runInPanes has and for the same reason: what stops a close is
    // a question to main now, and nothing on screen changes while the answer is out. Two presses in that
    // window build two confirm sheets. Answer the top one and the project closes correctly — the sheet
    // underneath stays on screen with nothing focusing it, the page behind goes on taking every key
    // because the window's guard only fires when focus is inside an overlay, and no key clears it.
    if (closing) return;
    const position = ports.positionOfSlot(slot);
    const page = ports.pages()[position];
    // The manager holds a slot of its own and has no folder to close; a slot with no page is one that
    // has already gone.
    if (!page || !isProjectPage(page)) return;
    closing = true;
    let refusal: string;
    try {
      refusal = await closeRefusalFor(page);
    } finally {
      // In a finally, because readPanes is an IPC call and can reject: a flag left up by one failed
      // round trip would make Ctrl+Q do nothing for the rest of the run. Nothing yields between here
      // and the sheet below, so no keystroke can arrive in the gap.
      closing = false;
    }
    if (refusal !== '') return ports.showNotice('close', refusal);
    // Nothing is in the way, so an earlier refusal is already false whatever the answer to the question
    // is: cancelling the dialog leaves no path back here to clear it.
    ports.showNotice('close', '');
    // Asked even when nothing is in the way, because that is exactly when the loss is invisible: a pane
    // editing an unsaved file in vim rings no bell and prints nothing, so the refusal above sees a quiet
    // project and lets it go. Deleting one card asks, and removing a worktree git can recreate asks
    // twice; this takes every shell and an editor with no undo.
    void ports.confirm(
      `Close ${page.project.name}?`,
      'Enter closes it, its shells and its editor. Escape keeps it.',
    ).then(async (confirmed) => {
      // The keyboard back to the page first, for the same reason namePane does it: the sheet that held the
      // focus has gone, so answering Escape here would otherwise leave you unable to type in any pane.
      ports.showPage(ports.activeIndex());
      if (!confirmed) return;
      // Read again rather than reused: the dialog is open for as long as it takes to answer, and the page
      // may have gone in that time — a folder deleted, a close from elsewhere — so what leaves the list is
      // found afresh here. Whatever page holds this slot is a project page, because the slot is the same
      // one the check at the top answered for and isProjectPage reads nothing else.
      const closingPage = ports.pages()[ports.positionOfSlot(slot)];
      if (!closingPage) return;
      // Read again with the page and for the same reason: the answer was given over a quiet project, and
      // a pane that took an agent or a question while the dialog was up is one the close refuses over.
      const late = await closeRefusalFor(closingPage);
      if (late !== '') return ports.showNotice('close', late);
      // The page's place in the list, found after that question rather than before it: asking main is a
      // round trip, and a project closed from elsewhere while it was out shifts every page after it
      // along. The index taken before would splice a different project out of the list.
      const closingPosition = ports.positionOfSlot(slot);
      if (closingPosition === -1) return;
      ports.closeProject(slot);
      ports.removePage(slot);
      // The page that went can be the one you were standing on, since the key closes the project you are
      // looking at. Land on whatever took its tab — the project to its right, or the tab to its left when
      // it was the last one, which is the manager at worst. A close from the manager's own list is the
      // other case and needs none of this: the manager holds the first tab and never moves off it, so
      // what leaves is always behind the page you are looking at.
      if (closingPosition === ports.activeIndex()) ports.landOn(positionAfterClose(closingPosition, ports.pages().length));
      // The row leaves the list, the tab leaves the strip, and the session file is written without it.
      ports.renderStatus();
    });
  };
}
