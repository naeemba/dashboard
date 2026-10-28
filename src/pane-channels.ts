import { Notification, type BrowserWindow } from 'electron';
import type { Channels } from './channels';
import type * as pty from 'node-pty';
import type { Screens } from './screens';

// What a pane sends the main process: its keystrokes, its size, a request to restart its shell, and a
// banner for it. Main-process wiring only, out of main.ts because main had reached its 600-line
// ceiling. Main hands over what only it holds — the live shells, the recorded sizes, how to spawn one,
// and the way to the renderer.
export function registerPaneChannels(table: Channels, main: {
  shells: Map<string, pty.IPty>;
  screens: Screens;
  spawnTerminal(id: string): void;
  window(): BrowserWindow | undefined;
  send(channel: string, ...payload: unknown[]): void;
}): void {
  // Clicking the banner is the answer to it: the app comes forward, and the renderer is told which pane
  // to land on. Without that half you arrive at whatever project you were last on and go looking for the
  // pane the banner had already named.
  table.on('notification:show', (_screen, title: string, body: string, paneId: string) => {
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

  table.on('pty:input', (_screen, id: string, data: string) => {
    main.shells.get(id)?.write(data);
  });
  // Recorded whether or not a shell is listening, because the pane that has none is exactly the pane
  // about to get one: a pane whose shell exited, the editor before nvim is started, a pane a ship is
  // about to take. The record is what spawnTerminal spawns at; sizeOfPane holds why.
  table.on('pty:resize', (screen, id: string, cols: number, rows: number) => {
    main.screens.resize(screen, id, { cols, rows });
    const size = main.screens.sizeOf(id);
    if (size) main.shells.get(id)?.resize(size.cols, size.rows);
  });
  table.on('pty:restart', (_screen, id: string) => {
    if (!main.shells.has(id)) main.spawnTerminal(id);
  });
}

// A screen that leaves stops voting on the size of every pane it drew, so each shell goes to what the
// screens still looking at it ask for. A pane nobody has measured keeps the size it has.
export function resizeShellsToScreens(shells: Map<string, pty.IPty>, screens: Screens): void {
  for (const [id, shell] of shells) {
    const size = screens.sizeOf(id);
    if (size) shell.resize(size.cols, size.rows);
  }
}
