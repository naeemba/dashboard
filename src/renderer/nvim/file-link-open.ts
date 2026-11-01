import type { DashboardBridge } from '../../shared/app/bridge';
import { failureText } from '../../shared/errors/failure';
import { fileLinksIn, type FileLink } from './file-links';
import type { Page } from '../app/page';
import { bufferLine, cellColumn } from '../panes/pane';
import type { WidthAt } from '../panes/print-widths';
import { linksStartingOn, linksTouching, type WrapBuffer } from '../panes/wrapped-links';

// The two decisions behind both ways of opening a path a pane printed: which paths are on screen and
// in what order, and what happens once one is picked. file-hints.ts puts the letters up; this decides.

export type ScreenBuffer = WrapBuffer & { viewportY: number };

// A path on the part of the pane you can see: its row from the top of the screen and the cell it
// starts in, which is where its label goes.
export type VisibleLink = { row: number; column: number; link: FileLink };

// The paths on the part of the pane you can see, bottom row first so the letters go to the newest
// output — the path an agent just printed gets `a`. Rows count from `viewportY`, so a pane scrolled
// back by hand labels what is in front of you, not the live screen under it. A path wrapped onto the
// next row is labelled once, where it starts — or, when it starts above the screen, on the top row
// where its visible part begins, so a path you can click is a path you can label.
export function visibleLinks(buffer: ScreenBuffer, rows: number, widthAt: WidthAt): VisibleLink[] {
  return Array.from({ length: rows }, (_value, offset) => rows - 1 - offset).flatMap((row) => {
    const line = buffer.viewportY + row;
    const text = bufferLine(buffer, line);
    const carriedIn = cellColumn(buffer.getLine(line), text.length - text.trimStart().length);
    const placed = (row === 0 ? linksTouching : linksStartingOn)(buffer, line, widthAt, fileLinksIn);
    return placed.map((link) => (
      { row, column: link.start.row === line ? link.start.column : carriedIn, link: link.link }
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
