import { BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import { TITLE_BAR_HEIGHT } from './theme';

// The window and the question its close asks. Main-process wiring, out of main.ts because main had
// reached its 600-line ceiling; nothing here decides anything a test could reach.

export type AppWindowOptions = {
  // The first frame's colour, painted before the renderer has run a line.
  background: string;
  // What has to happen after Quit is chosen and before the shells die.
  beforeQuit(): Promise<void>;
  // The page has loaded and can be sent a message.
  loaded(): void;
};

export function openAppWindow(options: AppWindowOptions): BrowserWindow {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
  ]));
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: options.background,
    // The renderer draws its own title row, so the window chrome is dark all the way up, the way Ghostty
    // looks. macOS keeps its traffic lights over that row; their frame is 16px tall, so this centres them.
    // Windows and Linux draw no buttons once the title bar is hidden, so they keep the system one.
    // The 13px inset here is what the 80px padding in the `.mac #title` rule of chrome.css clears; move
    // one and the title text either overlaps the lights or floats away from them.
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hidden' as const,
      trafficLightPosition: { x: 13, y: (TITLE_BAR_HEIGHT - 16) / 2 },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Chromium throttles a hidden page's timers, and after five minutes behind another window that
      // is once a minute. Everything this app does on a beat is a renderer timer: the pane refresh, the
      // bell, and the report saying which panes still have an agent working in them. Main's review
      // sweep is a Node timer and keeps its five seconds, so with throttling on it reads a report a
      // minute old, decides the agent has gone quiet and removes the worktree out from under a push
      // that is still running. Minimise the window while a shipped card is being worked and the commit
      // dies with the folder. A page of terminals is not a page that should stop ticking when it is
      // behind something.
      backgroundThrottling: false,
    },
  });
  // True while the quit question is on screen. Every close is stopped, so without it holding Cmd+Q
  // stacks a question per keypress and you answer the same one five times.
  let askingToQuit = false;
  // Closing the window kills every shell on every page, and there is no getting a long-running task
  // back. Cancel is the default button, so Enter and Escape both mean "I hit that by accident".
  // Asked without blocking: showMessageBoxSync stops the whole main process, so anything already
  // waiting there — a folder panel, a board write — can never finish while the question is up. The
  // close is stopped every time; destroy() is what actually goes, and it raises no close to answer.
  window.on('close', (event) => {
    event.preventDefault();
    if (askingToQuit) return;
    askingToQuit = true;
    void dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      message: 'Quit Dashboard?',
      detail: 'Every shell in every open project is killed, including anything still running in one.',
    }).then(async ({ response }) => {
      if (response !== 1) return;
      await options.beforeQuit();
      window.destroy();
    }).finally(() => {
      // Reset on the rejection path too. Leave it true after a failed dialog and every later close
      // is cancelled before it asks anything: the window can only be shut by Force Quit, which is
      // the one exit that kills the shells without asking.
      askingToQuit = false;
    });
  });
  // What went wrong before there was a bar to say it on. After the load, not before: a message sent to
  // a page that has not run its listeners yet lands nowhere.
  window.webContents.on('did-finish-load', () => options.loaded());
  // The window never leaves the app's own page. A stray link followed in it would replace every page
  // and pane on screen, with no way back, and hand the preload's bridge to whatever site it named.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  return window;
}
