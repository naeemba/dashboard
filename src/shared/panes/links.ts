// Where a link sits in the line, as string offsets, end exclusive.
export type LinkSpan = { start: number; end: number };

// The line number and column are inside the span, so the underline covers `main.ts:42` whole.
export type FileLink = LinkSpan & {
  path: string;
  line?: number;
  column?: number;
};

// A link comes out of a shell's output, so it is only as trustworthy as whatever printed it. Handing the
// operating system an arbitrary scheme is how a line of text opens a mail client or fires a registered
// protocol handler, so only pages get through.
export function isOpenableLink(url: string): boolean {
  const scheme = URL.parse(url)?.protocol;
  return scheme === 'http:' || scheme === 'https:';
}

// Where a frame navigation inside the window goes. The PDF viewer keeps its own blob and its own
// extension pages; a page link leaves for the browser, where every other link on the screen goes;
// anything else is dropped. Widen 'allow' and a link in a PDF loads a remote site inside the overlay.
// The window's own frame is not this rule's: will-navigate holds it. Electron raises this event for
// the main frame's load too, and judged here the dev server's http page went to the browser and the
// window stopped half loaded, its script never run: `pnpm start` showed an empty window on Windows.
export function frameNavigation(url: string, isMainFrame: boolean): 'allow' | 'browser' | 'refuse' {
  if (isMainFrame) return 'allow';
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
