import type { Page } from './page';
import type { ProjectClose, Refused } from '../../shared/app/bridge';
import type { PaneName } from '../../shared/panes/close-refusal';
import { isProjectPage } from '../../shared/manager/manager';

// The close key's flow. Whether the project may go, and the sentence saying why not, are project.close's
// in main; this asks it before its question, then closes through it, which asks again.

// What the close flow needs from renderer.ts, which owns the page list and the screen. Handed in rather
// than imported so this file stays a module the tests can load: the overlay and the page are DOM.
export type ProjectCloserPorts = {
  // project.close, over `projects:close`.
  closeProject: (request: ProjectClose) => Promise<{ output: string } | Refused>;
  // A function, since the list changes between calls: the closer reads it again after the question.
  pages: () => readonly Page[];
  positionOfSlot: (slot: number) => number;
  activeIndex: () => number;
  namedPanes: (page: Page) => PaneName[];
  showNotice: (owner: string, message: string) => void;
  confirm: (message: string, keysLine: string) => Promise<boolean>;
  showPage: (index: number) => void;
};

export function createProjectCloser(ports: ProjectCloserPorts): (slot: number) => Promise<void> {
  // Whether a close is already waiting on main for the panes it would take. closeProject says what a
  // second one costs.
  let closing = false;

  // Asked twice — once before the question and once with the answer, which closes it — so it is one
  // function. The reading and the refusal are main's; this only puts the page's names to the panes.
  //
  // The terminals, not the editor — which is a change, and a deliberate one. The editor pane runs nvim
  // for as long as the project is open, so on a reading of what the pty has in the foreground it is busy
  // from launch, and a close that counted it would refuse every time with `nvim` named as the thing in
  // the way. What guards a half-finished edit in nvim is the question below, which is asked whether or
  // not anything is in the way.
  async function askMain(page: Page, onlyCheck: boolean): Promise<string> {
    const answer = await ports.closeProject({ slot: page.slot, name: page.project.name, names: ports.namedPanes(page), onlyCheck });
    return 'refused' in answer ? answer.refused : '';
  }

  // Closing a project: the one you are on, or the one the manager's list is pointing at. Everything it
  // takes is gone for good — its shells, the editor, and whatever was running in them — so what can stop
  // it, and the sentence saying so, are project.close's. A pane that has exited or is sitting at a
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
      refusal = await askMain(page, true);
    } finally {
      // In a finally, because the check is an IPC call and can reject: a flag left up by one failed
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
      // Asked again with the close, for the same reason: the answer was given over a quiet project, and
      // a pane that took an agent or a question while the dialog was up is one main refuses over.
      const late = await askMain(closingPage, false);
      // Nothing to take down here when it closed: main pushes the list without the project before it
      // answers, on the same pipe, so applyProjects has already removed the page and landed on the tab
      // that took its place — the path a close from another screen takes.
      if (late !== '') ports.showNotice('close', late);
    });
  };
}
