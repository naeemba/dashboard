import type { DashboardBridge } from './bridge';
import { failureText } from './failure';
import { fileLinksIn, type FileLink } from './file-links';
import type { Page } from './page';
import { bufferLine, cellColumn, type CellLine, type PaneBuffer } from './pane';

// The two decisions behind both ways of opening a path a pane printed: which paths are on screen and
// in what order, and what happens once one is picked. file-hints.ts puts the letters up; this decides.

type ScreenLine = CellLine & { translateToString(trim: boolean): string };
export type ScreenBuffer = Pick<PaneBuffer, 'baseY' | 'length'> & {
  viewportY: number;
  getLine(row: number): ScreenLine | undefined;
};

// A path on the part of the pane you can see: its row from the top of the screen and the cell it
// starts in, which is where its label goes.
export type VisibleLink = { row: number; column: number; link: FileLink };

// The paths on the part of the pane you can see, bottom row first so the letters go to the newest
// output — the path an agent just printed gets `a`. Rows count from `viewportY`, so a pane scrolled
// back by hand labels what is in front of you, not the live screen under it.
export function visibleLinks(buffer: ScreenBuffer, rows: number): VisibleLink[] {
  return Array.from({ length: rows }, (_value, offset) => rows - 1 - offset).flatMap((row) => {
    const line = buffer.viewportY + row;
    return fileLinksIn(bufferLine(buffer, line)).map((link) => (
      { row, column: cellColumn(buffer.getLine(line), link.start), link }
    ));
  });
}

export type OpenFileLink = (page: Page, index: number, link: FileLink) => void;

export type FileLinkEditor = {
  startEditor(page: Page): void;
  showEditor(page: Page): void;
  report(message: string): void;
};

// Opening a path, by click or by letter: nvim is started if it is not running, and the page moves to it
// only once the file is there, so a path that names no file leaves you where you were.
export function fileLinkOpener(bridge: Pick<DashboardBridge, 'openFile'>, editor: FileLinkEditor): OpenFileLink {
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
