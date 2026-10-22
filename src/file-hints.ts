import type { DashboardBridge } from './bridge';
import { failureText } from './failure';
import { fileLinksIn, hintLabels, type FileLink } from './file-links';
import type { Page } from './page';
import { bufferLine, type Pane } from './pane';
import { isModified } from './shortcuts';

// The hint key: a letter over every file path on the pane's screen, and typing one opens that path. The
// keyboard's way to what a click on a path does, so both read their paths through file-links.ts.
//
// A view, so it has no test; which paths and which letters are file-links.ts's and are tested there.

// The paths on the part of the pane you can see, bottom row first so the letters go to the newest
// output — the path an agent just printed gets `a`.
function visibleLinks(pane: Pane): { row: number; link: FileLink }[] {
  const { rows, buffer } = pane.terminal;
  return Array.from({ length: rows }, (_value, offset) => rows - 1 - offset).flatMap((row) =>
    fileLinksIn(bufferLine(buffer.active, buffer.active.viewportY + row)).map((link) => ({ row, link })));
}

export type OpenFileLink = (page: Page, index: number, link: FileLink) => void;

// Opening a path, by click or by letter: nvim is started if it is not running, and the page moves to it
// only once the file is there, so a path that names no file leaves you where you were.
export function fileLinkOpener(
  bridge: DashboardBridge,
  editor: { startEditor(page: Page): void; showEditor(page: Page): void; report(message: string): void },
): OpenFileLink {
  return (page, index, link) => {
    editor.startEditor(page);
    bridge.openFile(page.slot, index, link).then(
      (answer) => {
        if (answer.ok) editor.showEditor(page);
        editor.report(answer.message);
      },
      (error: unknown) => editor.report(`Could not open ${link.path}: ${failureText(error)}`),
    );
  };
}

// Puts the letters over the focused pane and waits for one. Answers the status bar's line: empty when
// the letters are up, and why not when the screen has no path to label. Any key that is not a letter on
// screen, Escape included, and leaving the layer, take the letters down without opening anything.
export function showFileHints(page: Page, open: OpenFileLink): string {
  const index = page.focused;
  const pane = page.panes[index];
  const screen = pane?.terminal.element?.querySelector('.xterm-screen');
  if (!pane || !screen) return '';
  const links = visibleLinks(pane);
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
    const { row, link } = links[position];
    byLabel.set(label, link);
    const hint = document.createElement('span');
    hint.className = 'file-hint';
    hint.textContent = label;
    // ponytail: placed by string offset, so a wide character earlier on the row (CJK, emoji) shifts the
    // label left of its path. Measuring through xterm's cell widths is the upgrade if that shows up.
    hint.style.left = `${link.start * cellWidth}px`;
    hint.style.top = `${row * cellHeight}px`;
    layer.append(hint);
  });
  document.body.append(layer);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    layer.remove();
    pane.terminal.focus();
  }
  layer.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const link = byLabel.get(event.key);
    close();
    if (link) open(page, index, link);
  });
  layer.addEventListener('blur', close);
  layer.focus();
  return '';
}
