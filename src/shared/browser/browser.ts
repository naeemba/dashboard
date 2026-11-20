// A project's browser as main holds it and the screen draws it: its tabs in order and the one on
// screen. Main owns it (src/main/browser/browser-views.ts) and pushes it on every change; the screen
// never keeps a copy of its own to go stale.

// Who a tab answers to: you, or the pane id of the agent that opened or claimed it through the
// `dashboard browser` command (docs/browser/README.md).
export type TabHolder = 'user' | string;

// `takenFrom` is every pane you took the tab back from with the revoke key, so each one's next call on
// it is refused saying so, and its claim of it too, until that pane itself is let go.
export type BrowserTab = { id: number; url: string; title: string; holder: TabHolder; takenFrom?: readonly string[] };

export type BrowserState = { tabs: BrowserTab[]; active: number | null };

export const NO_TABS: BrowserState = { tabs: [], active: null };

// Where on the window the tab on screen is drawn, in the window's own pixels.
export type BrowserBounds = { x: number; y: number; width: number; height: number };

// The project whose tab on screen is drawn, and where.
export type BrowserPlacement = { projectPath: string; bounds: BrowserBounds };

export type BrowserStep = 'back' | 'forward' | 'reload';

// A viewport an agent asked a tab to be, to check a layout at a phone's width.
export type ViewportSize = { width: number; height: number };

// The browser actions the screen reaches, each its `browser:<verb>` channel.
export const BROWSER_VERBS = ['open', 'close', 'switch', 'navigate', 'step', 'show', 'hide', 'focus', 'reset', 'revoke'] as const;
export type BrowserVerb = typeof BROWSER_VERBS[number];
