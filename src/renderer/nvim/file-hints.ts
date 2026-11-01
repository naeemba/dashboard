import { hintLabels, type FileLink } from './file-links';
import { visibleLinks, type OpenFileLink } from './file-link-open';
import { focusedPane, type Page } from './page';
import type { Pane } from './pane';
import { isModified } from './shortcuts';

// Handed on so the renderer, at its size ceiling, takes both halves of the hint key from one import.
export { fileLinkOpener } from './file-link-open';

// The hint key: a letter over every file path on the pane's screen, and typing one opens that path. The
// keyboard's way to what a click on a path does, so both read their paths through file-links.ts.
//
// A view, so it has no test; which paths, in what order, and what opening one does are
// file-link-open.ts's and are tested there.

// Puts the letters over the focused pane and waits for one. Answers the status bar's line: empty when
// the letters are up, and why not when the screen has no path to label. Escape, or any unmodified key
// that is not a letter on screen, and leaving the layer, take the letters down without opening
// anything. A modified key does nothing while they are up.
export function showFileHints(page: Page, open: OpenFileLink): string {
  const index = page.focused;
  const focused = focusedPane(page);
  const screen = focused?.terminal.element?.querySelector('.xterm-screen');
  if (!focused || !screen) return '';
  // Held as a Pane: the close below is a function declaration, which TypeScript does not narrow into.
  const pane: Pane = focused;
  const links = visibleLinks(pane.terminal.buffer.active, pane.terminal.rows, pane.printWidths.at);
  if (links.length === 0) return 'no file path on this pane';

  const bounds = screen.getBoundingClientRect();
  const cellWidth = bounds.width / pane.terminal.cols;
  const cellHeight = bounds.height / pane.terminal.rows;
  const layer = document.createElement('div');
  layer.className = 'file-hints';
  layer.tabIndex = -1;
  Object.assign(layer.style, {
    left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
  });
  const byLabel = new Map<string, FileLink>();
  hintLabels(links.length).forEach((label, position) => {
    const { row, column, link } = links[position];
    byLabel.set(label, link);
    const hint = document.createElement('span');
    hint.className = 'file-hint';
    hint.textContent = label;
    hint.style.left = `${column * cellWidth}px`;
    hint.style.top = `${row * cellHeight}px`;
    layer.append(hint);
  });
  document.body.append(layer);

  let closed = false;
  // The keyboard goes back to the pane only when nothing else took it. A click on another pane blurs the
  // layer on its way there, and refocusing here would pull the keyboard back off the pane you clicked.
  function close(refocus: boolean): void {
    if (closed) return;
    closed = true;
    layer.remove();
    if (refocus) pane.terminal.focus();
  }
  layer.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const link = byLabel.get(event.key);
    close(true);
    if (link) open(page, index, link);
  });
  layer.addEventListener('blur', (event) => close(event.relatedTarget === null));
  layer.focus();
  return '';
}
