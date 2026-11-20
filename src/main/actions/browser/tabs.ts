import { stringOrEmpty } from '../../../shared/app/is-record';
import { isRefused, action } from '../action';
import { addressUrl } from '../../browser/address';
import { activeTab, namedTab, steppedTab, withoutTab, withTab } from '../../browser/browser-tabs';
import { projectInput, type BrowserPorts } from './browser-ports';

// browser.open, browser.close and browser.switch: a project's tab list. A tab opens for you; an
// agent's claim on one is the browser command's (docs/browser/README.md).

type Opened = { output: string; tab: number };

// An empty address is a new tab with nothing loaded yet, which the screen then asks an address for.
export const browserOpen = action<BrowserPorts, { projectPath: string; url: string }, Opened>('browser.open', {
  words: ['url'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const typed = stringOrEmpty(raw.url);
    const url = typed.trim() === '' ? 'about:blank' : addressUrl(typed);
    return isRefused(url) ? url : { ...project, url };
  },
  async run(ports, { projectPath, url }) {
    const id = ports.makeView(projectPath, url);
    ports.keep(projectPath, withTab(ports.browserOf(projectPath), { id, url, title: '', holder: 'user' }));
    return { output: `opened tab ${id}`, tab: id };
  },
});

export const browserClose = action<BrowserPorts, { projectPath: string; tab: unknown }, { output: string }>('browser.close', {
  words: ['tab'],
  input: (raw) => {
    const project = projectInput(raw);
    return isRefused(project) ? project : { ...project, tab: raw.tab };
  },
  async run(ports, { projectPath, tab }) {
    const id = namedTab(ports.browserOf(projectPath), tab);
    if (isRefused(id)) return id;
    ports.dropView(id);
    ports.keep(projectPath, withoutTab(ports.browserOf(projectPath), id));
    return { output: `closed tab ${id}` };
  },
});

// A tab by its id, or `step` places along from the one on screen, round the ends.
export const browserSwitch = action<BrowserPorts, { projectPath: string; tab: unknown; step: number | null }, { output: string }>('browser.switch', {
  words: ['tab'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    return { ...project, tab: raw.tab, step: Number.isInteger(raw.step) ? raw.step as number : null };
  },
  async run(ports, { projectPath, tab, step }) {
    const state = ports.browserOf(projectPath);
    const from = step === null ? namedTab(state, tab) : activeTab(state);
    if (isRefused(from)) return from;
    const id = step === null ? from : steppedTab(state, step) ?? from;
    ports.keep(projectPath, { ...state, active: id });
    return { output: `on tab ${id}` };
  },
});
