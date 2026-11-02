import { Notification, type BrowserWindow } from 'electron';
import type { Channels } from '../app/channels';
import type { PaneShell } from './pane-shell';
import type { Screens } from '../../shared/remote-host/screens';

// What a pane sends the main process: its keystrokes, its size, a request to restart its shell, and a
// banner for it. Main-process wiring only, out of main.ts because main had reached its 600-line
// ceiling. Main hands over what only it holds — the live shells, the recorded sizes, how to spawn one,
// and the way to the renderer.
export function registerPaneChannels(table: Channels, main: {
  shells: Map<string, PaneShell>;
  screens: Screens;
  spawnTerminal(id: string): void;
  window(): BrowserWindow | undefined;
}): void {
  // Clicking the banner is the answer to it: the app comes forward, and the renderer is told which pane
  // to land on. Without that half you arrive at whatever project you were last on and go looking for the
  // pane the banner had already named. Only this machine's window is told: the banner shows on the
  // desk it was raised on, and a remote screen landing on the pane would be answering a banner it never saw.
  table.on('notification:show', (_screen, title: string, body: string, paneId: string) => {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      // Landing on the pane is no use behind a window that is not on screen. macOS activates the app
      // for a click but leaves a minimized window in the Dock, and on Windows and Linux nothing
      // activates it at all, so ask for the window every time. show() is the hidden-to-shown
      // transition; coming back from the Dock is restore()'s, so both are needed.
      const window = main.window();
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send('notification:click', paneId);
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
    fitShell(main.shells, main.screens, id);
  });
  table.on('pty:restart', (_screen, id: string) => {
    if (!main.shells.has(id)) main.spawnTerminal(id);
  });
}

// A screen that leaves stops voting on the size of every pane it drew, so each shell goes to what the
// screens still looking at it ask for. A pane nobody has measured keeps the size it has.
export function resizeShellsToScreens(shells: Map<string, PaneShell>, screens: Screens): void {
  for (const id of shells.keys()) fitShell(shells, screens, id);
}

// Puts a shell at the size the screens agree on. A size it already has is not sent again: every resize
// is a SIGWINCH, and a full-screen program in the pane redraws on each one, so a second screen
// reporting the same size, or one leaving that did not hold the smallest, would flash every pane.
function fitShell(shells: Map<string, PaneShell>, screens: Screens, id: string): void {
  const shell = shells.get(id);
  const size = screens.sizeOf(id);
  if (!shell || !size || (shell.cols === size.cols && shell.rows === size.rows)) return;
  shell.resize(size.cols, size.rows);
}
