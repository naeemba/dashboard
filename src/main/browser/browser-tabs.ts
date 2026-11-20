import { createHash } from 'node:crypto';
import type { Refused } from '../../shared/app/bridge';
import type { BrowserState, BrowserTab } from '../../shared/browser/browser';

// The tab list's rules, apart from the views that draw it, so each can be tested without Electron.

// A new tab goes at the end and is the one on screen.
export function withTab(state: BrowserState, tab: BrowserTab): BrowserState {
  return { tabs: [...state.tabs, tab], active: tab.id };
}

// A closed tab hands the screen to the one after it, else the one before: where your eye already
// is, as every browser does it. The last one closed leaves none.
export function withoutTab(state: BrowserState, id: number): BrowserState {
  const place = state.tabs.findIndex((tab) => tab.id === id);
  if (place === -1) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.active !== id) return { tabs, active: state.active };
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
