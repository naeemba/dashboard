import { isRefused, action } from '../action';
import { claimFound, revokeRefusal, takenBack, withoutPane } from '../../browser/browser-holds';
import { NO_TAB_OPEN, withTabChange } from '../../browser/browser-tabs';
import type { BrowserPorts } from './browser-ports';
import { isFilledText, projectInput } from '../pane/pane-input';
import { agentInput, targetTab, type AgentTarget } from './target';

// browser.claim, browser.release and browser.revoke: who a tab answers to. An agent claims a tab and
// releases it through the browser command; the sweeps release every tab of a pane that is let go; you
// take the tab on screen back with the revoke key. Every rule is browser-holds.ts's.

export const browserClaim = action<BrowserPorts, AgentTarget, { output: string }>('browser.claim', {
  words: ['tab'],
  input: agentInput,
  async run(ports, { pane, tab }) {
    const found = claimFound(ports.allBrowsers(), pane, tab);
    if (isRefused(found)) return found;
    ports.keep(found.projectPath, withTabChange(ports.browserOf(found.projectPath), tab, { holder: pane }));
    return { output: `pane ${pane} holds tab ${tab}` };
  },
});

// One tab back to the user, or with no tab named every tab the pane holds, in every project: a pane
// released, finished, its agent exited or another started in it.
export const browserRelease = action<BrowserPorts, { pane: string; tab: number | null }, { output: string }>('browser.release', {
  words: ['tab'],
  input(raw) {
    if (raw.tab === undefined) return isFilledText(raw.pane) ? { pane: raw.pane, tab: null } : { refused: 'no pane was given' };
    return agentInput(raw);
  },
  async run(ports, { pane, tab }) {
    if (tab !== null) {
      const found = targetTab(ports, { pane, tab });
      if (isRefused(found)) return found;
      ports.keep(found.projectPath, withTabChange(ports.browserOf(found.projectPath), tab, { holder: 'user' }));
      return { output: `tab ${tab} is the user's again` };
    }
    let released = 0;
    for (const [projectPath, state] of [...ports.allBrowsers()]) {
      const next = withoutPane(state, pane);
      if (next === state) continue;
      released += state.tabs.filter((each) => each.holder === pane).length;
      ports.keep(projectPath, next);
    }
    return { output: `released ${released} tabs of ${pane}` };
  },
});

// The revoke key: the tab on screen taken from the agent holding it.
export const browserRevoke = action<BrowserPorts, { projectPath: string }, { output: string }>('browser.revoke', {
  words: [],
  input: projectInput,
  async run(ports, { projectPath }) {
    const state = ports.browserOf(projectPath);
    const tab = state.tabs.find((each) => each.id === state.active);
    if (tab === undefined) return NO_TAB_OPEN;
    const refusal = revokeRefusal(tab);
    if (refusal !== null) return refusal;
    ports.keep(projectPath, withTabChange(state, tab.id, takenBack(tab)));
    return { output: `took tab ${tab.id} back from ${tab.holder}` };
  },
});
