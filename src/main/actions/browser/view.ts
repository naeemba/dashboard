import type { BrowserBounds } from '../../../shared/browser/browser';
import { NO_TABS } from '../../../shared/browser/browser';
import { isRecord } from '../../../shared/app/is-record';
import { isRefused, action } from '../action';
import { projectInput, type BrowserPorts } from './browser-ports';
import { activeTab } from '../../browser/browser-tabs';

// browser.show, browser.hide, browser.focus and browser.reset: the view on the window. A web page is a
// native view drawn over the whole of the window's HTML, so the screen says where it goes and when it
// must go away (browser-placement.ts), and main never guesses either.

// Bounds the screen measured, whole pixels and never negative; anything else is not a place.
export function boundsOf(value: unknown): BrowserBounds | null {
  if (!isRecord(value)) return null;
  const sides = [value.x, value.y, value.width, value.height];
  if (!sides.every((side) => typeof side === 'number' && Number.isFinite(side) && side >= 0)) return null;
  const [x, y, width, height] = sides.map((side) => Math.round(side as number));
  return { x, y, width, height };
}

export const browserShow = action<BrowserPorts, { projectPath: string; bounds: BrowserBounds }, { output: string }>('browser.show', {
  words: [],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const bounds = boundsOf(raw.bounds);
    return bounds === null ? { refused: 'the bounds were not ones the app could read' } : { ...project, bounds };
  },
  async run(ports, placed) {
    ports.place(placed);
    return { output: 'shown' };
  },
});

export const browserHide = action<BrowserPorts, Record<string, never>, { output: string }>('browser.hide', {
  words: [],
  input: () => ({}),
  async run(ports) {
    ports.place(null);
    return { output: 'hidden' };
  },
});

// The keyboard into the tab on screen.
export const browserFocus = action<BrowserPorts, { projectPath: string }, { output: string }>('browser.focus', {
  words: [],
  input: projectInput,
  async run(ports, { projectPath }) {
    const id = activeTab(ports.browserOf(projectPath));
    if (isRefused(id)) return id;
    ports.focus(id);
    return { output: `tab ${id} has the keyboard` };
  },
});

// Every tab of a project gone: the project closed. Its logins stay on disk for its next open.
export const browserReset = action<BrowserPorts, { projectPath: string }, { output: string }>('browser.reset', {
  words: [],
  input: projectInput,
  async run(ports, { projectPath }) {
    const { tabs } = ports.browserOf(projectPath);
    for (const tab of tabs) ports.dropView(tab.id);
    ports.keep(projectPath, NO_TABS);
    return { output: `closed ${tabs.length} tabs` };
  },
});
