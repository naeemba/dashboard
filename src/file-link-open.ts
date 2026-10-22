import type { DashboardBridge } from './bridge';
import { failureText } from './failure';
import { fileLinksIn, type FileLink } from './file-links';
import type { Page } from './page';
import { linksStartingOn, type WrapBuffer } from './wrapped-links';

// The two decisions behind both ways of opening a path a pane printed: which paths are on screen and
// in what order, and what happens once one is picked. file-hints.ts puts the letters up; this decides.

export type ScreenBuffer = WrapBuffer & { viewportY: number };

// A path on the part of the pane you can see: its row from the top of the screen and the cell it
// starts in, which is where its label goes.
export type VisibleLink = { row: number; column: number; link: FileLink };

// The paths on the part of the pane you can see, bottom row first so the letters go to the newest
// output — the path an agent just printed gets `a`. Rows count from `viewportY`, so a pane scrolled
// back by hand labels what is in front of you, not the live screen under it. A path wrapped onto the
// next row is labelled once, where it starts.
export function visibleLinks(buffer: ScreenBuffer, rows: number, columns: number): VisibleLink[] {
  return Array.from({ length: rows }, (_value, offset) => rows - 1 - offset).flatMap((row) => (
    linksStartingOn(buffer, buffer.viewportY + row, columns, fileLinksIn).map((placed) => (
      { row, column: placed.start.column, link: placed.link }
    ))
  ));
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
