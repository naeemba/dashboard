import { app, shell } from 'electron';
import type { Channels } from './channels';
import { findPaneFile, noSuchFile, type PaneFolders } from './file-open';
import type { FileLink } from './file-links';
import { isOpenableLink } from './links';
import { openFileInEditor, openScrollback, type EditorTarget } from './nvim-remote';

// What a pane hands out of itself: a URL to the browser, its scrollback to nvim, a path it printed to
// nvim. Main-process wiring only, out of main.ts because main had reached its 600-line ceiling; every
// decision in these is in links.ts, nvim-remote.ts and file-open.ts. Main hands over what only it
// holds — the shell in force and where a pane's shell is.
export function registerPaneOpeners(table: Channels, main: {
  shellCommand(): string;
  paneFolders(slot: number, index: number): PaneFolders;
}): void {
  table.on('link:open', (_screen, url: string) => {
    if (isOpenableLink(url)) void shell.openExternal(url);
  });
  // Ctrl+`: the focused pane's scrollback, written to a file and opened in the project's nvim. Every
  // decision in that is nvim-remote.ts; what is here is the channel and the temp folder it works in.
  table.handle('scrollback:open', (_screen, slot: number, index: number, text: string) => (
    openScrollback(app.getPath('temp'), main.shellCommand(), slot, index, text)
  ));
  // A path a pane printed, looked for where that pane's shell is standing now; file-open.ts says why.
  table.handle('file:open', async (_screen, slot: number, index: number, link: FileLink) => {
    const file = await findPaneFile(link.path, main.paneFolders(slot, index), app.getPath('home'));
    if (file === undefined) return { ok: false, message: noSuchFile(link.path) };
    const editor: EditorTarget = { temporaryDirectory: app.getPath('temp'), shellCommand: main.shellCommand(), slot };
    return openFileInEditor(editor, file, link.line, link.column);
  });
}
