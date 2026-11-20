import { app } from 'electron';
import path from 'node:path';
import type { Channels } from '../../app/channels';
import { browserPage } from '../../browser/browser-page';
import { browserRequests, type BrowserRequestPorts } from '../../browser/browser-requests';
import { browserViews, type BrowserViewsMain } from '../../browser/browser-views';
import type { SessionReply, SessionRequest } from '../../workers/session-cli';
import { bind, registerActions } from '../action';
import type { BrowserPorts } from './browser-ports';
import { browserClaim, browserRelease, browserRevoke } from './claims';
import { browserNavigate, browserStep } from './navigate';
import { browserClick, browserPress, browserResize, browserType } from './page';
import { browserClose, browserOpen, browserSwitch } from './tabs';
import { browserFocus, browserHide, browserReset, browserShow } from './view';

// Main's wiring for the browser actions and their doors, out of main.ts, which is at its 600-line
// ceiling. The screen reaches each through its `browser:<verb>` channel; a page's new window is
// browser.open and a page closing itself browser.close; a project closing, or its page leaving the
// screen, is browser.reset; the browser command reaches them through `requests`, and a pane let go
// of is browser.release of all its tabs. docs/browser/README.md has the whole of it.
export function browserActions(table: Channels, main: BrowserViewsMain) {
  // A page's window that is no web page is denied before it opens (browser-views.ts).
  const views = browserViews(main, {
    opened: (projectPath, url) => void open.call({ projectPath, url }),
    closed: (projectPath, tab, opener) => void close.call({ projectPath, tab, opener }),
  });
  // Where `browser screenshot` saves its pictures: the app's own folder, which only this user reads,
  // rather than a shared /tmp, and out of every checkout.
  const page = browserPage(views.pages, views.ports.allBrowsers, path.join(app.getPath('userData'), 'browser-screenshots'));
  const ports: BrowserPorts = { ...views.ports, ...page.ports };
  const open = bind(browserOpen, ports);
  const close = bind(browserClose, ports);
  const reset = bind(browserReset, ports);
  const release = bind(browserRelease, ports);
  const navigate = bind(browserNavigate, ports);
  const step = bind(browserStep, ports);
  registerActions(table, [
    open, close, bind(browserSwitch, ports), navigate, step, bind(browserShow, ports),
    bind(browserHide, ports), bind(browserFocus, ports), reset, bind(browserRevoke, ports),
  ]);
  // A read, so no action: the tabs a page built after they were opened draws.
  table.handle('browser:read', (_screen, projectPath: unknown) => views.ports.browserOf(String(projectPath)));
  const actions: BrowserRequestPorts['actions'] = {
    open, release, navigate, step, claim: bind(browserClaim, ports), resize: bind(browserResize, ports),
    click: bind(browserClick, ports), type: bind(browserType, ports), press: bind(browserPress, ports),
  };
  return {
    owns: views.owns,
    reset,
    // Every tab the pane holds back to the user: the pane released, finished, its agent exited, or
    // another agent started in it.
    letGo: (pane: string): void => void release.call({ pane }),
    requests: (panes: Omit<BrowserRequestPorts, 'actions' | 'reads'>, otherwise: (request: SessionRequest) => Promise<SessionReply>) =>
      browserRequests({ ...panes, actions, reads: page.reads }, otherwise),
  };
}
