import type { Refused } from '../../shared/app/bridge';
import type { BrowserState, BrowserTab } from '../../shared/browser/browser';

// Who may act on a tab: the rules of an agent's claim, apart from the views, so each is tested without
// Electron. A tab is the user's or one pane's. A pane acts only on the tabs it holds, reads included;
// the user takes any tab back with the revoke key, and the pane is then told so on its next call. Every
// refusal is worded here, and the actions and the page reads answer with it (errors-rule-1).

type Browsers = ReadonlyMap<string, BrowserState>;

// A tab and the project whose browser it is in. Tab ids are the app's, unique across projects, so an
// agent names a tab by its id alone.
type FoundTab = { projectPath: string; tab: BrowserTab };

const tookBack = (tab: BrowserTab, then: string): Refused => ({ refused: `the user took tab ${tab.id} back from this pane; ${then}` });
const heldByOther = (tab: BrowserTab): Refused => ({ refused: `tab ${tab.id} is held by pane ${tab.holder}` });

const wasTakenFrom = (tab: BrowserTab, pane: string): boolean => tab.takenFrom?.includes(pane) === true;

// Why this pane may not act on the tab, or null when it holds it. Another pane's tab is that pane's,
// whoever it was taken from before.
function notHeldRefusal(tab: BrowserTab, pane: string): Refused | null {
  if (tab.holder === pane) return null;
  if (tab.holder !== 'user') return heldByOther(tab);
  if (wasTakenFrom(tab, pane)) return tookBack(tab, 'it is theirs now');
  return { refused: `tab ${tab.id} is the user's; \`browser claim ${tab.id}\` it first` };
}

// Why this pane may not claim the tab, or null when it may: a tab the user took back from it stays
// theirs, and one another pane holds is that pane's until it lets go or the user takes it.
function claimRefusal(tab: BrowserTab, pane: string): Refused | null {
  if (wasTakenFrom(tab, pane)) return tookBack(tab, 'open a tab of your own');
  return tab.holder !== 'user' && tab.holder !== pane ? heldByOther(tab) : null;
}

// The tab the id names in any project, when the rule lets this pane have it.
function foundIf(browsers: Browsers, pane: string, id: number, rule: (tab: BrowserTab, pane: string) => Refused | null): FoundTab | Refused {
  for (const [projectPath, state] of browsers) {
    const tab = state.tabs.find((each) => each.id === id);
    if (tab !== undefined) return rule(tab, pane) ?? { projectPath, tab };
  }
  return { refused: `there is no tab ${id}; \`browser tabs\` lists them` };
}

// The tab, when this pane holds it.
export const heldTab = (browsers: Browsers, pane: string, id: number): FoundTab | Refused => foundIf(browsers, pane, id, notHeldRefusal);

export const claimFound = (browsers: Browsers, pane: string, id: number): FoundTab | Refused => foundIf(browsers, pane, id, claimRefusal);

// Why the revoke key does nothing on this tab, or null when an agent holds it.
export function revokeRefusal(tab: BrowserTab): Refused | null {
  return tab.holder === 'user' ? { refused: `tab ${tab.id} is already yours` } : null;
}

// A pane let go of: released, finished, its agent exited, or a new agent started in it. Its tabs go
// back to the user and stay open, and what the user took from it is forgotten, since the next agent
// in that pane is somebody else. The same state back when the pane had nothing here.
export function withoutPane(state: BrowserState, pane: string): BrowserState {
  if (!state.tabs.some((tab) => tab.holder === pane || wasTakenFrom(tab, pane))) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      const { takenFrom, ...rest } = tab;
      const others = (takenFrom ?? []).filter((each) => each !== pane);
      const kept = others.length === 0 ? rest : { ...rest, takenFrom: others };
      return tab.holder === pane ? { ...kept, holder: 'user' } : kept;
    }),
  };
}

// The revoke key's change: the tab the user's, and the pane it held it remembered among those taken from.
export const takenBack = (tab: BrowserTab): Partial<BrowserTab> => ({ holder: 'user', takenFrom: [...(tab.takenFrom ?? []), tab.holder] });

// `browser tabs`: a line a tab, with who holds it as the asking pane reads it.
export function tabLines(state: BrowserState, pane: string): string {
  if (state.tabs.length === 0) return 'no tab is open in this project';
  return state.tabs.map((tab) => {
    const holder = tab.holder === pane ? 'yours' : tab.holder === 'user' ? 'the user\'s' : `pane ${tab.holder}`;
    return tabLine(tab, holder);
  }).join('\n');
}

// One tab as every listing of tabs prints it: id, who holds it when that is said, address, title.
export function tabLine(tab: BrowserTab, holder?: string): string {
  const title = tab.title.trim();
  return [tab.id, holder, tab.url, title === '' ? undefined : title].filter((part) => part !== undefined).join('  ');
}
