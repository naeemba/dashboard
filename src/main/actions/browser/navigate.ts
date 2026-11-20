import { stringOrEmpty } from '../../../shared/app/is-record';
import type { BrowserStep } from '../../../shared/browser/browser';
import { isRefused, action } from '../action';
import { addressUrl } from '../../browser/address';
import { withTabChange } from '../../browser/browser-tabs';
import type { BrowserPorts } from './browser-ports';
import { targetInput, targetTab, type Target } from './target';

// browser.navigate and browser.step: what a tab shows, the screen's tab on screen or a tab an agent
// holds (target.ts). Where the page then goes by itself, a link followed or a redirect, is the view's to
// report (browser-views.ts), not an action's.

export const browserNavigate = action<BrowserPorts, Target & { url: string }, { output: string }>('browser.navigate', {
  words: ['url'],
  input(raw) {
    const target = targetInput(raw);
    if (isRefused(target)) return target;
    const url = addressUrl(stringOrEmpty(raw.url));
    return isRefused(url) ? url : { ...target, url };
  },
  async run(ports, input) {
    const found = targetTab(ports, input);
    if (isRefused(found)) return found;
    ports.load(found.id, input.url);
    ports.keep(found.projectPath, withTabChange(ports.browserOf(found.projectPath), found.id, { url: input.url }));
    return { output: `tab ${found.id} to ${input.url}` };
  },
});

const STEPS: readonly BrowserStep[] = ['back', 'forward', 'reload'];

export const browserStep = action<BrowserPorts, Target & { step: BrowserStep }, { output: string }>('browser.step', {
  words: ['step'],
  input(raw) {
    const target = targetInput(raw);
    if (isRefused(target)) return target;
    const step = STEPS.find((each) => each === raw.step);
    return step === undefined ? { refused: `a step is ${STEPS.join(', ')}` } : { ...target, step };
  },
  async run(ports, input) {
    const found = targetTab(ports, input);
    if (isRefused(found)) return found;
    ports.step(found.id, input.step);
    return { output: `tab ${found.id} ${input.step}` };
  },
});
