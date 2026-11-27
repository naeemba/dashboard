import type { BrowserState } from '../../../shared/browser/browser';
import { NO_TABS } from '../../../shared/browser/browser';
import type { BrowserPorts } from './browser-ports';

// The views as a list of what was asked of them, for the actions' tests.
// A node is a file input when `fileInputs` names it, and a file is there when `files` holds it. Every
// worker reports to page 5's main, another project's than any pane the tests name.
export function fakePorts(
  start: Record<string, BrowserState> = {}, refs: Record<string, number> = {},
  fileInputs: Record<number, { multiple: boolean }> = {}, files: readonly string[] = [],
): BrowserPorts & { done: string[]; browsers: Map<string, BrowserState> } {
  const browsers = new Map(Object.entries(start));
  const done: string[] = [];
  let id = 10;
  return {
    done,
    browsers,
    browserOf: (projectPath) => browsers.get(projectPath) ?? NO_TABS,
    allBrowsers: () => browsers,
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
    emulate: async (tab, size) => { done.push(size === null ? `unsize ${tab}` : `size ${tab} ${size.width}x${size.height}`); },
    refsOf: () => new Map(Object.entries(refs)),
    runScript: async (tab, script, waitFor) => {
      done.push(`eval ${tab} ${JSON.stringify({ script, waitFor })}`);
      return `tab ${tab}'s script answered nothing`;
    },
    fileInputOf: async (_tab, node) => fileInputs[node] ?? null,
    isFile: async (file) => files.includes(file),
    tellMain: (slot, text) => { done.push(`tell ${slot} ${text.split('\n')[0]}`); },
    mainOf: () => 5,
    useProxy: async (next) => {
      done.push(`proxy ${next === null ? 'direct' : next.server}`);
    },
    act: async (tab, act) => { done.push(`${act.kind} ${tab} ${JSON.stringify({ ...act, kind: undefined })}`); },
  };
}
