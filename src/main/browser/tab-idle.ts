import type { BrowserState, BrowserTab } from '../../shared/browser/browser';
import { MAIN_INDEX, paneFromId } from '../../shared/panes/terminals';
import { tabLine } from './browser-holds';

// When an agent's tab is asked about, never closed for being idle (browser-decision-10). Only a tab an
// agent opened is ever asked about: one the user opened stays theirs to close, whoever claims it later.
// Its clock restarts on every browser call on it and whenever it is the tab on screen, the one the user
// is looking at or typing in. Unused for the setting's minutes, its holder is asked once, and not
// again until the tab is used and goes unused again: an agent that says nothing keeps it.

export type TabQuestion = { pane: string; tabs: BrowserTab[] };

type Use = { usedAt: number; asked: boolean };

export function tabClock() {
  // Each tab ever seen: when it was last used and whether its holder was asked since, or null for a
  // tab the user opened.
  const uses = new Map<number, Use | null>();
  const used = (tab: number, now: number): void => {
    const use = uses.get(tab);
    if (use) Object.assign(use, { usedAt: now, asked: false });
  };
  return {
    // Every state the browser keeps, so a tab is seen the moment it opens, by whoever opened it.
    seen(state: BrowserState, now: number): void {
      for (const tab of state.tabs) if (!uses.has(tab.id)) uses.set(tab.id, tab.holder === 'user' ? null : { usedAt: now, asked: false });
    },
    used,
    // The agents to ask now, a question each naming its tabs, those marked asked. A tab gone is forgotten.
    due(browsers: ReadonlyMap<string, BrowserState>, now: number, idleMs: number | null): TabQuestion[] {
      const open = new Set<number>();
      const byPane = new Map<string, BrowserTab[]>();
      for (const state of browsers.values()) {
        for (const tab of state.tabs) {
          open.add(tab.id);
          if (tab.id === state.active) used(tab.id, now);
          const use = uses.get(tab.id);
          if (!use || use.asked || idleMs === null || tab.holder === 'user' || now - use.usedAt < idleMs) continue;
          use.asked = true;
          const tabs = byPane.get(tab.holder) ?? [];
          tabs.push(tab);
          byPane.set(tab.holder, tabs);
        }
      }
      for (const id of uses.keys()) if (!open.has(id)) uses.delete(id);
      return [...byPane].map(([pane, tabs]) => ({ pane, tabs }));
    },
  };
}

const indented = (tab: BrowserTab): string => `  ${tabLine(tab)}`;

// The question to the tab's holder. Its answer is what it does: `browser close` is yes, anything else no.
export function idleQuestion(tabs: readonly BrowserTab[], minutes: number): string {
  return [
    `The Dashboard app asks: these browser tabs you hold have not been used for ${minutes} minutes.`,
    ...tabs.map(indented),
    'Close each one you are done with (`browser close <tab>`, the browser_close tool). Leave the rest open:',
    'nothing closes them, and you are not asked about one again until you use it and it goes unused again.',
  ].join('\n');
}

// The page whose main session the pane is, which is told through its chat, or null for a worker pane.
export function mainSlotOf(pane: string): number | null {
  const { slot, index } = paneFromId(pane);
  return index === MAIN_INDEX ? slot : null;
}

// Who is told, and what, when a pane is let go of still holding tabs: its page's main, that they stay
// open and are the user's. Its agent is gone, so nobody is asked; nothing when it held none, or when it
// is that main.
export function leftOpenNotice(browsers: ReadonlyMap<string, BrowserState>, pane: string): { main: number; text: string } | null {
  const tabs = [...browsers.values()].flatMap((state) => state.tabs.filter((tab) => tab.holder === pane));
  const { slot, index } = paneFromId(pane);
  if (tabs.length === 0 || index === MAIN_INDEX) return null;
  return {
    main: slot,
    text: [`Pane ${pane} was let go of still holding these browser tabs. They are left open and are the user's now:`, ...tabs.map(indented)].join('\n'),
  };
}
