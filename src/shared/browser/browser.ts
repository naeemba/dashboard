// A project's browser as main holds it and the screen draws it: its tabs in order and the one on
// screen. Main owns it (src/main/browser/browser-views.ts) and pushes it on every change; the screen
// never keeps a copy of its own to go stale.

// Who a tab answers to: you, or the pane id of the agent that claimed it. Only `user` is ever written
// so far; the claim is the browser command's (docs/browser/README.md).
export type TabHolder = 'user' | string;

export type BrowserTab = { id: number; url: string; title: string; holder: TabHolder };

export type BrowserState = { tabs: BrowserTab[]; active: number | null };

export const NO_TABS: BrowserState = { tabs: [], active: null };

// Where on the window the tab on screen is drawn, in the window's own pixels.
export type BrowserBounds = { x: number; y: number; width: number; height: number };

export type BrowserStep = 'back' | 'forward' | 'reload';

// The browser actions the screen reaches, each its `browser:<verb>` channel.
export const BROWSER_VERBS = ['open', 'close', 'switch', 'navigate', 'step', 'show', 'hide', 'focus'] as const;
export type BrowserVerb = typeof BROWSER_VERBS[number];
