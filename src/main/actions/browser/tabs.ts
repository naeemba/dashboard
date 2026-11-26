import type { Refused } from '../../../shared/app/bridge';
import { stringOrEmpty } from '../../../shared/app/is-record';
import { isRefused, action } from '../action';
import { addressUrl } from '../../browser/address';
import { activeTab, namedTab, steppedTab, wholeNumber, withoutTab, withTab } from '../../browser/browser-tabs';
import type { BrowserPorts } from './browser-ports';
import { isFilledText, projectInput } from '../pane/pane-input';
import { agentInput, targetTab, type AgentTarget } from './target';

// browser.open, browser.close and browser.switch: a project's tab list. A tab opens for you, or for
// the agent in the pane the browser command names, which then holds it (browser-holds.ts).

type Opened = { output: string; tab: number };

// An empty address is a new tab with nothing loaded yet, which the screen then asks an address for.
// `opener` is the tab whose page opened this one as a window: a popup from an agent's tab is that
// agent's, behind the one on screen, so its work never takes the page from under you. One from the
// tab on screen comes on screen whoever opened it, you or the agent holding that tab (its clicks
// count as a gesture too): it is the page you are looking at, as in any browser.
type OpenInput = { projectPath: string; url: string; pane: string | null; opener: number | null };

export const browserOpen = action<BrowserPorts, OpenInput, Opened>('browser.open', {
  words: ['url'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    if (raw.pane !== undefined && !isFilledText(raw.pane)) return { refused: 'no pane was given' };
    const typed = stringOrEmpty(raw.url);
    const url = typed.trim() === '' ? 'about:blank' : addressUrl(typed);
    return isRefused(url) ? url : { ...project, url, pane: raw.pane ?? null, opener: wholeNumber(raw.opener) };
  },
  async run(ports, { projectPath, url, pane, opener }) {
    const before = ports.browserOf(projectPath);
    const holder = pane ?? before.tabs.find((each) => each.id === opener)?.holder ?? 'user';
    const id = ports.makeView(projectPath, url);
    const state = withTab(ports.browserOf(projectPath), { id, url, title: '', holder });
    ports.keep(projectPath, opener !== null && opener === before.active ? { ...state, active: id } : state);
    return { output: `opened tab ${id}`, tab: id };
  },
});

const NO_TAB_NAMED = { refused: 'no tab was named' };

// `opener` is the tab a popup that closed itself came from, which gets the screen back (withoutTab).
// A pane named is the browser command's agent, closing a tab it holds: its answer to the idle question
// (tab-idle.ts), or work it is done with.
type CloseInput = { projectPath: string; tab: number; opener: number | null } | AgentTarget;

export const browserClose = action<BrowserPorts, CloseInput, { output: string }>('browser.close', {
  words: ['tab'],
  input: (raw) => {
    if (raw.pane !== undefined) return agentInput(raw);
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const tab = wholeNumber(raw.tab);
    return tab === null ? NO_TAB_NAMED : { ...project, tab, opener: wholeNumber(raw.opener) };
  },
  async run(ports, input) {
    let found: { projectPath: string; id: number } | Refused;
    let opener: number | null = null;
    if ('pane' in input) {
      found = targetTab(ports, input);
    } else {
      const id = namedTab(ports.browserOf(input.projectPath), input.tab);
      found = isRefused(id) ? id : { projectPath: input.projectPath, id };
      opener = input.opener;
    }
    if (isRefused(found)) return found;
    const { projectPath, id } = found;
    ports.dropView(id);
    ports.keep(projectPath, withoutTab(ports.browserOf(projectPath), id, opener));
    return { output: `closed tab ${id}` };
  },
});

// A tab by its id, or `step` places along from the one on screen, round the ends.
export const browserSwitch = action<BrowserPorts, { projectPath: string; tab: number | null; step: number | null }, { output: string }>('browser.switch', {
  words: ['tab'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const tab = wholeNumber(raw.tab);
    const step = wholeNumber(raw.step);
    return tab === null && step === null ? NO_TAB_NAMED : { ...project, tab, step };
  },
  async run(ports, { projectPath, tab, step }) {
    const state = ports.browserOf(projectPath);
    const from = step === null && tab !== null ? namedTab(state, tab) : activeTab(state);
    if (isRefused(from)) return from;
    const id = step === null ? from : steppedTab(state, step) ?? from;
    ports.keep(projectPath, { ...state, active: id });
    return { output: `on tab ${id}` };
  },
});
