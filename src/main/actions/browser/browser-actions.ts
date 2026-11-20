import type { Channels } from '../../app/channels';
import { browserViews, type BrowserViewsMain } from '../../browser/browser-views';
import { bind, registerActions } from '../action';
import { browserNavigate, browserStep } from './navigate';
import { browserClose, browserOpen, browserSwitch } from './tabs';
import { browserFocus, browserHide, browserReset, browserShow } from './view';

// Main's wiring for the browser actions and their doors, out of main.ts, which is at its 600-line
// ceiling. The screen reaches each through its `browser:<verb>` channel; a page's new window is
// browser.open; a project closing is browser.reset. docs/browser/README.md has the whole of it.
export function browserActions(table: Channels, main: BrowserViewsMain) {
  // Refused, a page's window that is no web page opens nowhere.
  const views = browserViews(main, (projectPath, url) => void open.call({ projectPath, url }));
  const open = bind(browserOpen, views.ports);
  registerActions(table, [
    open, bind(browserClose, views.ports), bind(browserSwitch, views.ports), bind(browserNavigate, views.ports),
    bind(browserStep, views.ports), bind(browserShow, views.ports), bind(browserHide, views.ports), bind(browserFocus, views.ports),
  ]);
  // A read, so no action: the tabs a page built after they were opened draws.
  table.handle('browser:read', (_screen, projectPath: unknown) => views.ports.browserOf(String(projectPath)));
  return { owns: views.owns, reset: bind(browserReset, views.ports) };
}
