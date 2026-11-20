import type { Refused } from '../../../shared/app/bridge';
import { isRefused } from '../action';
import { heldTab } from '../../browser/browser-holds';
import { activeTab, wholeNumber } from '../../browser/browser-tabs';
import type { BrowserPorts } from './browser-ports';
import { isFilledText, projectInput } from '../pane/pane-input';

// Which tab an action acts on, by who asked. The screen acts on its project's tab on screen; an agent,
// through the browser command, on a tab it names by id and must hold (browser-holds.ts).

export type AgentTarget = { pane: string; tab: number };
export type Target = { projectPath: string } | AgentTarget;

const NO_TAB_NAMED: Refused = { refused: 'no tab was named' };

export function agentInput(raw: Record<string, unknown>): AgentTarget | Refused {
  if (!isFilledText(raw.pane)) return { refused: 'no pane was given' };
  const tab = wholeNumber(raw.tab);
  return tab === null ? NO_TAB_NAMED : { pane: raw.pane, tab };
}

// A pane named is the command's agent; none is the screen.
export function targetInput(raw: Record<string, unknown>): Target | Refused {
  return raw.pane === undefined ? projectInput(raw) : agentInput(raw);
}

export function targetTab(ports: BrowserPorts, target: Target): { projectPath: string; id: number } | Refused {
  if ('projectPath' in target) {
    const id = activeTab(ports.browserOf(target.projectPath));
    return isRefused(id) ? id : { projectPath: target.projectPath, id };
  }
  const found = heldTab(ports.allBrowsers(), target.pane, target.tab);
  return isRefused(found) ? found : { projectPath: found.projectPath, id: found.tab.id };
}
