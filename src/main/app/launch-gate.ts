import { app, type BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';

// Whether this process goes on to be the app. main.ts imports this before anything else, for these two
// lines: a launch that is not going to be the app stops here, before main.ts has opened the session
// socket, bound the host's port or written a file.

if (started) app.quit();

// One app per userData folder. A second copy on the same folder would share session.json, recents.json,
// worktrees.json and session-index.json with the first, and whichever wrote last would win. The lock is
// Electron's, and Electron keys it on the userData folder, so a copy started with its own
// `--user-data-dir` (the performance demo) takes a lock of its own and runs beside the installed app.
// settings.json is not in userData (settings-store.ts) and such a copy still shares it, which is why the
// demo also runs with a HOME of its own.
// app.exit, not app.quit: quit waits for the event loop, and main.ts would run in the meantime.
if (!app.requestSingleInstanceLock()) app.exit(0);

// The launch that lost the lock hands its command line to the one that holds it, which brings its window
// to the front and reads the arguments with the same reader it used for its own (connectAtLaunch in
// remote-ipc.ts). The working directory the second launch was started in is not passed on: nothing read
// from the command line is a path yet.
export function whenLaunchedAgain(window: () => BrowserWindow | undefined, launchedWith: (argv: string[]) => void): void {
  app.on('second-instance', (_event, argv) => {
    const shown = window();
    if (shown?.isMinimized()) shown.restore();
    shown?.focus();
    launchedWith(argv);
  });
}
