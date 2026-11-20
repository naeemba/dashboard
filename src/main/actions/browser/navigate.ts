import { stringOrEmpty } from '../../../shared/app/is-record';
import type { BrowserStep } from '../../../shared/browser/browser';
import { isRefused, action } from '../action';
import { addressUrl } from '../../browser/address';
import { activeTab, withTabChange } from '../../browser/browser-tabs';
import { projectInput, type BrowserPorts } from './browser-ports';

// browser.navigate and browser.step: what the tab on screen shows. Where the page then goes by itself,
// a link followed or a redirect, is the view's to report (browser-views.ts), not an action's.

export const browserNavigate = action<BrowserPorts, { projectPath: string; url: string }, { output: string }>('browser.navigate', {
  words: ['url'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const url = addressUrl(stringOrEmpty(raw.url));
    return isRefused(url) ? url : { ...project, url };
  },
  async run(ports, { projectPath, url }) {
    const id = activeTab(ports.browserOf(projectPath));
    if (isRefused(id)) return id;
    ports.load(id, url);
    ports.keep(projectPath, withTabChange(ports.browserOf(projectPath), id, { url }));
    return { output: `tab ${id} to ${url}` };
  },
});

const STEPS: readonly BrowserStep[] = ['back', 'forward', 'reload'];

export const browserStep = action<BrowserPorts, { projectPath: string; step: BrowserStep }, { output: string }>('browser.step', {
  words: ['step'],
  input(raw) {
    const project = projectInput(raw);
    if (isRefused(project)) return project;
    const step = STEPS.find((each) => each === raw.step);
    return step === undefined ? { refused: `a step is ${STEPS.join(', ')}` } : { ...project, step };
  },
  async run(ports, { projectPath, step }) {
    const id = activeTab(ports.browserOf(projectPath));
    if (isRefused(id)) return id;
    ports.step(id, step);
    return { output: `tab ${id} ${step}` };
  },
});
