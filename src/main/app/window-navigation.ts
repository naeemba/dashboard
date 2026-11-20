import { isOpenableLink } from '../../shared/panes/links';
import { isBrowsable } from '../browser/address';

// Where the app window and its PDF viewer may go, and the key that puts the viewer away.

// Where a frame navigation inside the window goes. The PDF viewer keeps its own blob and its own
// extension pages; a page link leaves for the browser, where every other link on the screen goes;
// anything else is dropped. Widen 'allow' and a link in a PDF loads a remote site inside the overlay.
// The window's main frame is not this rule's: will-navigate holds it. Electron raises this event for
// that frame's load too, and judged here the dev server's http page went to the browser and the
// window stopped half loaded, its script never run: `pnpm start` showed an empty window on Windows.
// Only the window's main frame: a viewer in a contents of its own has a main frame too, and nothing
// but this rule holds it.
// A browser tab's contents (browser-views.ts) is the one place a web page loads: any of its frames may
// go to a web page, and nowhere else. Asked by the contents, never by the URL, so a PDF's link still
// leaves for the browser rather than loading in the overlay.
export function frameNavigation(
  url: string, frame: { isMainFrame: boolean; isWindowContents: boolean; isBrowserTab: boolean },
): 'allow' | 'browser' | 'refuse' {
  if (frame.isMainFrame && frame.isWindowContents) return 'allow';
  if (frame.isBrowserTab && isBrowsable(url)) return 'allow';
  if (/^(blob|chrome-extension):/.test(url)) return 'allow';
  return isOpenableLink(url) ? 'browser' : 'refuse';
}

// Whether the window's own frame may go to `url`. Never in a packaged app: a stray link followed there
// would replace every page and pane on screen. Under `pnpm start` the dev server's client reloads the
// page itself, once at launch when it has bundled dependencies and again after an edit; refused, the
// window kept the load it had cut short, its script never run, and showed an empty screen on Windows.
// Only the dev server's own origin gets through, so a link still cannot take the window anywhere.
export function windowMayNavigate(url: string, devServerUrl: string | undefined): boolean {
  if (!devServerUrl) return false;
  const origin = URL.parse(devServerUrl)?.origin;
  return origin !== undefined && URL.parse(url)?.origin === origin;
}

// The key that puts the viewer away: a bare Escape going down. Shift+Escape and the key coming back
// up stay with whatever has the keyboard.
export function dismissesViewer(input: {
  type: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean;
}): boolean {
  return input.type === 'keyDown' && input.key === 'Escape'
    && !(input.shift || input.control || input.alt || input.meta);
}
