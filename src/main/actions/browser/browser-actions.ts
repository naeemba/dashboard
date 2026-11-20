import type { Channels } from '../../app/channels';
import { browserViews, type BrowserViewsMain } from '../../browser/browser-views';
import { bind, registerActions } from '../action';
import { browserNavigate, browserStep } from './navigate';
import { browserClose, browserOpen, browserSwitch } from './tabs';
import { browserFocus, browserHide, browserReset, browserShow } from './view';

// Main's wiring for the browser actions and their doors, out of main.ts, which is at its 600-line
// ceiling. The screen reaches each through its `browser:<verb>` channel; a page's new window is
// browser.open and a page closing itself browser.close; a project closing, or its page leaving the
// screen, is browser.reset.
// docs/browser/README.md has the whole of it.
export function browserActions(table: Channels, main: BrowserViewsMain) {
  // A page's window that is no web page is denied before it opens (browser-views.ts).
  const views = browserViews(main, {
    opened: (projectPath, url) => void open.call({ projectPath, url }),
    closed: (projectPath, tab, opener) => void close.call({ projectPath, tab, opener }),
  });
  const open = bind(browserOpen, views.ports);
  const close = bind(browserClose, views.ports);
  const reset = bind(browserReset, views.ports);
  registerActions(table, [
    open, close, bind(browserSwitch, views.ports), bind(browserNavigate, views.ports),
    bind(browserStep, views.ports), bind(browserShow, views.ports), bind(browserHide, views.ports), bind(browserFocus, views.ports), reset,
  ]);
  // A read, so no action: the tabs a page built after they were opened draws.
  table.handle('browser:read', (_screen, projectPath: unknown) => views.ports.browserOf(String(projectPath)));
  return { owns: views.owns, reset };
}
