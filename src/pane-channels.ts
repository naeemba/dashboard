import { Notification, ipcMain, type BrowserWindow } from 'electron';
import type * as pty from 'node-pty';
import { LOCAL_SCREEN, type Screens } from './screens';

// What a pane sends the main process: its keystrokes, its size, a request to restart its shell, and a
// banner for it. Main-process wiring only, out of main.ts because main had reached its 600-line
// ceiling. Main hands over what only it holds — the live shells, the recorded sizes, how to spawn one,
// and the way to the renderer.
export function registerPaneChannels(main: {
  shells: Map<string, pty.IPty>;
  screens: Screens;
  spawnTerminal(id: string): void;
  window(): BrowserWindow | undefined;
  send(channel: string, ...payload: unknown[]): void;
}): void {
  // Clicking the banner is the answer to it: the app comes forward, and the renderer is told which pane
  // to land on. Without that half you arrive at whatever project you were last on and go looking for the
  // pane the banner had already named.
  ipcMain.on('notification:show', (_event, title: string, body: string, paneId: string) => {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      // Landing on the pane is no use behind a window that is not on screen. macOS activates the app
      // for a click but leaves a minimized window in the Dock, and on Windows and Linux nothing
      // activates it at all, so ask for the window every time. show() is the hidden-to-shown
      // transition; coming back from the Dock is restore()'s, so both are needed.
      const window = main.window();
      if (window) {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      }
      main.send('notification:click', paneId);
    });
    notification.show();
  });

  ipcMain.on('pty:input', (_event, id: string, data: string) => {
    main.shells.get(id)?.write(data);
  });
  // Recorded whether or not a shell is listening, because the pane that has none is exactly the pane
  // about to get one: a pane whose shell exited, the editor before nvim is started, a pane a ship is
  // about to take. The record is what spawnTerminal spawns at; sizeOfPane holds why.
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    main.screens.resize(LOCAL_SCREEN, id, { cols, rows });
    const size = main.screens.sizeOf(id);
    if (size) main.shells.get(id)?.resize(size.cols, size.rows);
  });
  ipcMain.on('pty:restart', (_event, id: string) => {
    if (!main.shells.has(id)) main.spawnTerminal(id);
  });
}
