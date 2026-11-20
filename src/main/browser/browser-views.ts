import { session, WebContentsView, type BrowserWindow, type WebContents } from 'electron';
import { NO_TABS, type BrowserState, type BrowserTab } from '../../shared/browser/browser';
import { leavingKey } from '../../shared/keys/browser-keys';
import type { Settings } from '../../shared/settings/settings';
import type { BrowserPorts } from '../actions/browser/browser-ports';
import { mayAsk, partitionOf, shownTab, withTabChange } from './browser-tabs';

// The one module that holds a WebContentsView, a tab each. The browser actions reach the views only
// through the ports below and every door reaches them only through the actions (actions-rule-1);
// bypasses.test.ts keeps every view's construction here. Main-process wiring: every rule it follows is in
// browser-tabs.ts, browser-keys.ts and the actions.

export type BrowserViewsMain = {
  window(): BrowserWindow | undefined;
  keys(): Settings['keys'];
};

// `opened` is a page asking for a new window, which gets a tab instead: browser.open.
export function browserViews(main: BrowserViewsMain, opened: (projectPath: string, url: string) => void) {
  const browsers = new Map<string, BrowserState>();
  const views = new Map<number, WebContentsView>();
  let placed: { projectPath: string; bounds: Electron.Rectangle } | null = null;
  let lastId = 0;
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
  // is no action's. A site that sets the same title every second sends nothing.
  function record(projectPath: string, id: number, change: Partial<Omit<BrowserTab, 'id'>>): void {
    const state = browsers.get(projectPath);
    const tab = state?.tabs.find((each) => each.id === id);
    if (state === undefined || tab === undefined || Object.entries(change).every(([field, value]) => tab[field as keyof BrowserTab] === value)) return;
    browsers.set(projectPath, withTabChange(state, id, change));
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
      // microphone, your location, banners.
      if (!ruled.has(partition)) session.fromPartition(partition).setPermissionRequestHandler((_contents, permission, answer) => answer(mayAsk(permission)));
      ruled.add(partition);
      // No preload, so a page has no bridge to call; sandboxed and isolated like any browser tab.
      const view = new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      wire(projectPath, id, view.webContents);
      view.setVisible(false);
      main.window()?.contentView.addChildView(view);
      views.set(id, view);
      view.webContents.loadURL(url).catch(() => undefined);
      return id;
    },
    dropView(id) {
      const view = views.get(id);
      views.delete(id);
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

  return {
    ports,
    // Whether a contents is one of the browser's tabs, for the window's navigation rule.
    owns: (contents: WebContents): boolean => [...views.values()].some((view) => view.webContents === contents),
  };
}
