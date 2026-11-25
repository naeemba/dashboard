import { createHash } from 'node:crypto';
import type { Refused } from '../../shared/app/bridge';
import type { BrowserBounds, BrowserState, BrowserTab } from '../../shared/browser/browser';

// The tab list's rules, apart from the views that draw it, so each can be tested without Electron.

// A new tab goes at the end and is the one on screen. An agent's goes behind the one you are on, so
// its work never takes the page from under you; into a project with none, it is the one on screen.
export function withTab(state: BrowserState, tab: BrowserTab): BrowserState {
  const onScreen = tab.holder === 'user' || state.active === null;
  return { tabs: [...state.tabs, tab], active: onScreen ? tab.id : state.active };
}

// A closed tab hands the screen to the one after it, else the one before: where your eye already
// is, as every browser does it. A popup that closes itself hands it back to its `opener` instead,
// while that is open: the page it signed you in to. The last one closed leaves none.
export function withoutTab(state: BrowserState, id: number, opener: number | null = null): BrowserState {
  const place = state.tabs.findIndex((tab) => tab.id === id);
  if (place === -1) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.active !== id) return { tabs, active: state.active };
  if (tabs.some((tab) => tab.id === opener)) return { tabs, active: opener };
  return { tabs, active: (tabs[place] ?? tabs[place - 1])?.id ?? null };
}

// The tab `step` places from the one on screen, round the ends.
export function steppedTab(state: BrowserState, step: number): number | null {
  const place = state.tabs.findIndex((tab) => tab.id === state.active);
  if (place === -1) return null;
  return state.tabs[(place + step + state.tabs.length) % state.tabs.length].id;
}

// The same state back when nothing changes, a tab not there or every field already so, so the caller
// can tell a change from none by identity.
export function withTabChange(state: BrowserState, id: number, change: Partial<Omit<BrowserTab, 'id'>>): BrowserState {
  const tab = state.tabs.find((each) => each.id === id);
  if (tab === undefined || Object.entries(change).every(([field, value]) => tab[field as keyof BrowserTab] === value)) return state;
  return { ...state, tabs: state.tabs.map((each) => (each === tab ? { ...tab, ...change } : each)) };
}

export const NO_TAB_OPEN: Refused = { refused: 'this project has no tab open' };

// The tab a door named, or why it is not one to act on. The actions answer with it.
export function namedTab(state: BrowserState, id: number): number | Refused {
  if (state.tabs.length === 0) return NO_TAB_OPEN;
  return state.tabs.some((tab) => tab.id === id) ? id : { refused: `there is no tab ${id} in this project` };
}

// A whole number as a door gave it: a number from the screen, a word from the browser command.
export function wholeNumber(value: unknown): number | null {
  const number = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  return Number.isInteger(number) ? number : null;
}

// The tab on screen, for an action that acts on it.
export function activeTab(state: BrowserState): number | Refused {
  return state.active ?? NO_TAB_OPEN;
}

// The one view on the window, if any: the tab on screen in the project placed there.
export function shownTab(placedProject: string | null, browsers: ReadonlyMap<string, BrowserState>): number | null {
  return placedProject === null ? null : browsers.get(placedProject)?.active ?? null;
}

// Where a tab's view is drawn, null for hidden. The tab on screen fills the box the screen measured.
// A tab an agent holds is drawn too, at its own size, all of it off the window but its bottom-right
// pixel in the window's top-left corner: a hidden page is throttled and paints nothing, and one
// drawn runs as a foreground tab does (browser-decision-9). Every other tab is hidden.
export function viewBounds(tab: BrowserTab | undefined, shown: number | null, placed: BrowserBounds | null, size: BrowserBounds): BrowserBounds | null {
  if (tab === undefined) return null;
  if (tab.id === shown && placed !== null) return placed;
  if (tab.holder === 'user') return null;
  return { x: 1 - size.width, y: 1 - size.height, width: size.width, height: size.height };
}

// What becomes of the keyboard a tab just took (browser-rule-4). The person can only put it in the
// tab on screen, by a click on its page or the focus verb, so a tab that is not on screen never
// keeps it: Chromium hands it one when a load the app started in it begins and commits, and when the
// window is activated again and the tab had it last. Neither does the tab on screen while such a
// load is on its way in. The tab the person just asked for counts as on screen: the ask reaches main
// before the screen's word of where it is drawn. That goes back at once while the window has the
// keyboard, else when it gets it again, as giving it back now would raise the window over the app the
// person is in.
export type KeyboardTaken = 'kept' | 'given back' | 'given back on return';

export function keyboardTaken(tab: { onScreen: boolean; asked: boolean; loadStarting: boolean; windowFocused: boolean }): KeyboardTaken {
  if ((tab.onScreen || tab.asked) && !tab.loadStarting) return 'kept';
  return tab.windowFocused ? 'given back' : 'given back on return';
}

// Whether a load that has just started is one the app started (an address, back, forward, reload),
// which hands its tab the keyboard: a whole page in the tab's own frame that no frame started.
// Electron documents `initiator` as null then, and this build leaves it out.
export function appLoad(start: { isMainFrame: boolean; isSameDocument: boolean; initiator?: unknown }): boolean {
  return start.isMainFrame && !start.isSameDocument && start.initiator == null;
}

// Where the keyboard goes back to: the tab the person just asked for and is not drawn yet, else the
// tab they were typing in while it is still the one on screen, else the window's own page (null).
export function keyboardOwner(typing: number | null, shown: number | null, asked: number | null): number | null {
  if (asked !== null) return asked;
  return typing !== null && typing === shown ? typing : null;
}

// Each project's cookies, logins and storage, kept on disk under a name of its own: a sign-in in one
// project is never seen by another, nor by the app's own window. Named from the folder rather than the
// project's name, which two folders can share. Moving the folder starts it signed out.
export function partitionOf(projectPath: string): string {
  return `persist:browser-${createHash('sha256').update(projectPath).digest('hex').slice(0, 16)}`;
}

// What a page may be given when it asks: copying to the clipboard, which a site's copy button does.
// Never the camera, the microphone, your location, banners or the whole screen.
const GRANTED = new Set(['clipboard-sanitized-write']);

export function mayAsk(permission: string): boolean {
  return GRANTED.has(permission);
}
