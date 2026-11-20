import type { BrowserState } from '../../../shared/browser/browser';
import { NO_TABS } from '../../../shared/browser/browser';
import type { BrowserPorts } from './browser-ports';

// The views as a list of what was asked of them, for the actions' tests.
export function fakePorts(start: Record<string, BrowserState> = {}): BrowserPorts & { done: string[]; browsers: Map<string, BrowserState> } {
  const browsers = new Map(Object.entries(start));
  const done: string[] = [];
  let id = 10;
  return {
    done,
    browsers,
    browserOf: (projectPath) => browsers.get(projectPath) ?? NO_TABS,
    keep: (projectPath, state) => { browsers.set(projectPath, state); },
    makeView: (projectPath, url) => {
      done.push(`make ${++id} ${url} in ${projectPath}`);
      return id;
    },
    dropView: (tab) => { done.push(`drop ${tab}`); },
    load: (tab, url) => { done.push(`load ${tab} ${url}`); },
    step: (tab, step) => { done.push(`${step} ${tab}`); },
    place: (placed) => { done.push(placed === null ? 'place none' : `place ${placed.projectPath} ${JSON.stringify(placed.bounds)}`); },
    focus: (tab) => { done.push(`focus ${tab}`); },
  };
}
