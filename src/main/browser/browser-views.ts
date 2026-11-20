import { session, WebContentsView, type BrowserWindow, type Rectangle, type WebContents } from 'electron';
import { NO_TABS, type BrowserBounds, type BrowserPlacement, type BrowserState, type BrowserTab } from '../../shared/browser/browser';
import { leavingKey } from '../../shared/keys/browser-keys';
import type { Settings } from '../../shared/settings/settings';
import type { BrowserPorts } from '../actions/browser/browser-ports';
import { mayAsk, partitionOf, shownTab, withTabChange } from './browser-tabs';
import { pageLog, requestFailure, type PageLog } from './page-log';

// The one module that holds a WebContentsView, a tab each. The browser actions reach the views only
// through the ports below and every door reaches them only through the actions (actions-rule-1);
// bypasses.test.ts keeps every view's construction here. Main-process wiring: every rule it follows is in
// browser-tabs.ts, browser-keys.ts and the actions.

export type BrowserViewsMain = {
  window(): BrowserWindow | undefined;
  keys(): Settings['keys'];
};

// What browser-page.ts drives a page's content with: the DevTools protocol, a picture of what the
// view draws, and what the page logged. The protocol goes through the tab's own webContents.debugger,
// never a --remote-debugging-port, which would hand the app's window and terminals to anyone who asks.
export type PagePorts = {
  send(id: number, method: string, parameters?: Record<string, unknown>): Promise<unknown>;
  // Drawn even while the view is hidden, as an agent's tab is.
  capture(id: number, rect?: Rectangle): Promise<Buffer>;
  logOf(id: number): PageLog | undefined;
};

// The ports the views give the actions; the page's own (emulate, refsOf, act) are browser-page.ts's.
type ViewPorts = Omit<BrowserPorts, 'emulate' | 'refsOf' | 'act'>;

// The size a tab is laid out at before it was ever on screen, an agent's tab: a laptop's window.
const UNPLACED: BrowserBounds = { x: 0, y: 0, width: 1280, height: 800 };
// A page that does not answer the protocol in this long, a hung script, is said to be so.
const PROTOCOL_TIMEOUT = 15_000;

// `opened` is a page asking for a new window, which gets a tab instead: browser.open.
export function browserViews(main: BrowserViewsMain, opened: (projectPath: string, url: string) => void) {
  const browsers = new Map<string, BrowserState>();
  const views = new Map<number, WebContentsView>();
  let placed: BrowserPlacement | null = null;
  // Where the last tab on screen was drawn, for a tab made while none is: the size the page will get.
  let lastBounds = UNPLACED;
  let lastId = 0;
  const logs = new Map<number, PageLog>();
  // Each partition's permission rule is set once, by its first tab.
  const ruled = new Set<string>();

  // To the local window only: a remote screen has a browser of its own.
  function send(projectPath: string): void {
    main.window()?.webContents.send('browser:change', projectPath, browsers.get(projectPath) ?? NO_TABS);
  }

  // Exactly one view drawn, the placed project's tab on screen, and every other one hidden.
  function apply(): void {
    const shown = shownTab(placed?.projectPath ?? null, browsers);
    if (placed !== null) lastBounds = placed.bounds;
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

  function wire(projectPath: string, id: number, contents: WebContents): void {
    contents.setWindowOpenHandler(({ url }) => {
      opened(projectPath, url);
      return { action: 'deny' };
    });
    contents.on('page-title-updated', (_event, title) => record(projectPath, id, { title }));
    contents.on('did-navigate', (_event, url) => record(projectPath, id, { url }));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) record(projectPath, id, { url }); });
    contents.on('console-message', ({ level, message, sourceId, lineNumber }) => logs.get(id)?.console(level, message, sourceId, lineNumber));
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

  const ports: ViewPorts = {
    browserOf: (projectPath) => browsers.get(projectPath) ?? NO_TABS,
    allBrowsers: () => browsers,
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
        // Every failed request of the partition's tabs, to the tab that made it.
        const failed = (contentsId: number | undefined, method: string, url: string, failure: string | null) => {
          if (failure === null) return;
          const tab = [...views].find(([, each]) => each.webContents.id === contentsId)?.[0];
          if (tab !== undefined) logs.get(tab)?.request(method, url, failure);
        };
        browserSession.webRequest.onCompleted((details) => failed(details.webContentsId, details.method, details.url, requestFailure(details.statusCode, null)));
        browserSession.webRequest.onErrorOccurred((details) => failed(details.webContentsId, details.method, details.url, requestFailure(null, details.error)));
      }
      ruled.add(partition);
      // No preload, so a page has no bridge to call; sandboxed and isolated like any browser tab.
      const view = new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      logs.set(id, pageLog());
      wire(projectPath, id, view.webContents);
      view.setVisible(false);
      view.setBounds(lastBounds);
      main.window()?.contentView.addChildView(view);
      views.set(id, view);
      view.webContents.loadURL(url).catch(() => undefined);
      return id;
    },
    dropView(id) {
      const view = views.get(id);
      views.delete(id);
      logs.delete(id);
      if (view === undefined) return;
      main.window()?.contentView.removeChildView(view);
      view.webContents.close();
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

  // The tab's protocol, attached on its first use and kept for the tab's life.
  const pages: PagePorts = {
    async send(id, method, parameters) {
      const contents = views.get(id)?.webContents;
      if (contents === undefined) throw new Error(`tab ${id} is closed`);
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`tab ${id} did not answer ${method} in ${PROTOCOL_TIMEOUT / 1000} seconds`)), PROTOCOL_TIMEOUT);
      });
      try {
        return await Promise.race([contents.debugger.sendCommand(method, parameters), late]);
      } finally {
        clearTimeout(timer);
      }
    },
    async capture(id, rect) {
      const contents = views.get(id)?.webContents;
      if (contents === undefined) throw new Error(`tab ${id} is closed`);
      return (await contents.capturePage(rect, { stayHidden: true })).toPNG();
    },
    logOf: (id) => logs.get(id),
  };

  return {
    ports,
    pages,
    // Whether a contents is one of the browser's tabs, for the window's navigation rule.
    owns: (contents: WebContents): boolean => [...views.values()].some((view) => view.webContents === contents),
  };
}
