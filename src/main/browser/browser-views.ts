import { session, WebContentsView, type BrowserWindow, type WebContents } from 'electron';
import { NO_TABS, type BrowserPlacement, type BrowserState, type BrowserTab } from '../../shared/browser/browser';
import { leavingKey } from '../../shared/keys/browser-keys';
import type { Settings } from '../../shared/settings/settings';
import type { BrowserPorts } from '../actions/browser/browser-ports';
import { isBrowsable } from './address';
import { mayAsk, partitionOf, shownTab, withTabChange } from './browser-tabs';

// The one module that holds a WebContentsView, a tab each. The browser actions reach the views only
// through the ports below and every door reaches them only through the actions (actions-rule-1);
// bypasses.test.ts keeps every view's construction here. Main-process wiring: every rule it follows is in
// browser-tabs.ts, browser-keys.ts and the actions.

export type BrowserViewsMain = {
  window(): BrowserWindow | undefined;
  keys(): Settings['keys'];
};

// What a page does to its tabs, each a browser action: a new window opened, which is a tab
// (browser.open), and itself closed (browser.close), with the tab that opened it, if one did.
export type BrowserPageDoors = {
  opened(projectPath: string, url: string): void;
  closed(projectPath: string, tab: number, opener: number | null): void;
};

export function browserViews(main: BrowserViewsMain, page: BrowserPageDoors) {
  const browsers = new Map<string, BrowserState>();
  const views = new Map<number, WebContentsView>();
  let placed: BrowserPlacement | null = null;
  let lastId = 0;
  // The window a page's window.open made and the tab that opened it, held for the browser.open call
  // that makes its tab: the next view made takes it rather than making contents of its own. That
  // happens inside `page.opened` only because `bind`'s `call` awaits nothing before `run`.
  let adopting: { contents: WebContents; opener: number } | null = null;
  // Each partition's permission rule is set once, by its first tab.
  const ruled = new Set<string>();

  // To the local window only: a remote screen has a browser of its own.
  function send(projectPath: string): void {
    main.window()?.webContents.send('browser:change', projectPath, browsers.get(projectPath) ?? NO_TABS);
  }

  // Exactly one view drawn, the placed project's tab on screen, and every other one hidden.
  function apply(): void {
    const shown = shownTab(placed?.projectPath ?? null, browsers);
    for (const [id, view] of views) {
      view.setVisible(id === shown);
      if (id === shown && placed !== null) view.setBounds(placed.bounds);
    }
  }

  // What the page did by itself, a link followed or a title set: written down, not asked for, so it
  // is no action's. A site that sets the same title every second sends nothing (withTabChange).
  function record(projectPath: string, id: number, change: Partial<Omit<BrowserTab, 'id'>>): void {
    const state = browsers.get(projectPath);
    if (state === undefined) return;
    const next = withTabChange(state, id, change);
    if (next === state) return;
    browsers.set(projectPath, next);
    send(projectPath);
  }

  function wire(projectPath: string, id: number, contents: WebContents, opener: number | null): void {
    // The new window is a tab built from the contents Chromium made for it, so it keeps its
    // `window.opener` and a sign-in popup can hand the sign-in back. It outlives its opener, as a tab
    // does: the opener going elsewhere never takes a half-done sign-in with it.
    contents.setWindowOpenHandler(({ url }) => {
      if (!isBrowsable(url)) return { action: 'deny' };
      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow(options) {
          // Electron passes the contents it made in `webContents`, which its type leaves out. A page
          // that gave up its opener gets none and nothing loads it, so its tab loads the address, and
          // what is returned then is never read.
          const popup = (options as { webContents?: WebContents }).webContents;
          adopting = popup === undefined ? null : { contents: popup, opener: id };
          page.opened(projectPath, url);
          adopting = null;
          return popup ?? contents;
        },
      };
    });
    // A page that closes itself (window.close, as a sign-in popup does once it is done) takes its tab
    // with it, and the screen goes back to the tab that opened it. A tab an action dropped has left
    // `views` already.
    contents.once('destroyed', () => { if (views.has(id)) page.closed(projectPath, id, opener); });
    contents.on('page-title-updated', (_event, title) => record(projectPath, id, { title }));
    contents.on('did-navigate', (_event, url) => record(projectPath, id, { url }));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) record(projectPath, id, { url }); });
    // A web page has the keyboard to itself. The keys the window's lookup acts on in browser mode are
    // taken off it and handed to the window, which gets the keyboard back with them.
    contents.on('before-input-event', (event, input) => {
      const key = leavingKey(input, main.keys());
      const window = main.window();
      if (key === null || window === undefined) return;
      event.preventDefault();
      window.webContents.focus();
      window.webContents.send('browser:key', key);
    });
  }

  const ports: BrowserPorts = {
    browserOf: (projectPath) => browsers.get(projectPath) ?? NO_TABS,
    keep(projectPath, state) {
      browsers.set(projectPath, state);
      send(projectPath);
      apply();
    },
    makeView(projectPath, url) {
      const id = ++lastId;
      const partition = partitionOf(projectPath);
      // Electron grants a page every permission it asks for unless told otherwise: the camera, the
      // microphone, your location, banners. A check (`Notification.permission`) answers the same.
      if (!ruled.has(partition)) {
        const browserSession = session.fromPartition(partition);
        browserSession.setPermissionRequestHandler((_contents, permission, answer) => answer(mayAsk(permission)));
        browserSession.setPermissionCheckHandler((_contents, permission) => mayAsk(permission));
      }
      ruled.add(partition);
      // No preload, so a page has no bridge to call; sandboxed and isolated like any browser tab. A
      // popup is already all that, in its opener's partition, which Electron gave it.
      const popup = adopting;
      adopting = null;
      const view = new WebContentsView(popup === null
        ? { webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } }
        : { webContents: popup.contents });
      wire(projectPath, id, view.webContents, popup?.opener ?? null);
      view.setVisible(false);
      main.window()?.contentView.addChildView(view);
      views.set(id, view);
      if (popup === null) view.webContents.loadURL(url).catch(() => undefined);
      return id;
    },
    dropView(id) {
      const view = views.get(id);
      views.delete(id);
      if (view === undefined) return;
      main.window()?.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    },
    // A load that fails shows Chromium's own error page in the tab, which says why better than a bar.
    load: (id, url) => { views.get(id)?.webContents.loadURL(url).catch(() => undefined); },
    step(id, step) {
      const contents = views.get(id)?.webContents;
      if (contents === undefined) return;
      ({ back: () => contents.navigationHistory.goBack(), forward: () => contents.navigationHistory.goForward(), reload: () => contents.reload() })[step]();
    },
    // The keyboard goes back to the window with the view, so it is never left in a page nobody sees.
    place(next) {
      placed = next;
      apply();
      if (next === null) main.window()?.webContents.focus();
    },
    focus: (id) => { views.get(id)?.webContents.focus(); },
  };

  return {
    ports,
    // Whether a contents is one of the browser's tabs, for the window's navigation rule.
    owns: (contents: WebContents): boolean => [...views.values()].some((view) => view.webContents === contents),
  };
}
