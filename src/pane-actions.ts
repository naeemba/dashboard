import { failureText } from './failure';
import { confirmOverlay } from './overlay';
import { focusTerminals, focusedPane, toggleFold, toggleZoom, type Page } from './page';
import { closeQuestion, paneLabel, paneName } from './terminals';

// The terminals view's keys that act on one pane of the page you are on and need nothing of the
// renderer's but a way to main and to the error line. Out of renderer.ts, which was past its 600-line
// ceiling.

export type PanePorts = {
  closePane(slot: number, index: number): Promise<void>;
  onError(owner: string, message: string): void;
};

export type PaneActionKind = 'terminal-zoom' | 'terminal-close' | 'terminal-fold' | 'terminal-copy' | 'terminal-paste';

export function runPaneAction(page: Page, kind: PaneActionKind, ports: PanePorts): void {
  switch (kind) {
    case 'terminal-zoom': return toggleZoom(page);
    case 'terminal-close': return closePane(page, page.focused, ports);
    case 'terminal-fold': return toggleFold(page, page.focused);
    // Nothing selected copies nothing, rather than emptying the clipboard you were about to paste from.
    // Wiring, not a decision: getSelection() returning '' is the whole rule, so it has no module or test.
    case 'terminal-copy': {
      const selection = focusedPane(page)?.terminal.getSelection();
      if (selection) void navigator.clipboard.writeText(selection);
      return;
    }
    // paste() rather than input(): it wraps the text in bracketed-paste markers when the shell asked
    // for them, so a pasted line with a newline in it is not run on arrival.
    // The pane is taken at the keystroke, so a focus move before the clipboard answers cannot send
    // the paste to another shell.
    case 'terminal-paste': {
      const pane = focusedPane(page);
      return void navigator.clipboard.readText().then((text) => pane?.terminal.paste(text));
    }
  }
}

// The close key and a worker's close button. A pane whose shell is still alive asks first, since closing
// stops whatever runs there; one whose shell has exited just goes. Main takes it off the list and every
// page's list follows; the keyboard goes back to main if it was there. The question took the keyboard
// and its sheet is gone either way, so the keyboard comes back to the pane before the answer is acted
// on: left on the body, the pane closing would not be seen to have had it, and nothing would take it.
export function closePane(page: Page, index: number, ports: PanePorts): void {
  const pane = page.panes.find((each) => each.index === index);
  if (!pane) return;
  const close = () => ports.closePane(page.slot, index)
    .catch((error: unknown) => ports.onError('pane', `Pane not closed: ${failureText(error)}`));
  const question = closeQuestion(paneLabel(index, undefined, paneName(pane)), pane.exited);
  if (question === null) return void close();
  void confirmOverlay(question, 'Enter closes it · Escape keeps it').then((yes) => {
    focusTerminals(page);
    if (yes) void close();
  });
}
