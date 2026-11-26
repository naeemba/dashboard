import type { BrowserState, BrowserTab } from '../../shared/browser/browser';
import { MAIN_INDEX, paneFromId } from '../../shared/panes/terminals';
import { tabLine } from './browser-holds';

// When an agent's tab is asked about, never closed for being idle (browser-decision-10). Only a tab a
// main opened is ever asked about: one the user opened stays theirs to close, whoever claims it later,
// and a worker is never asked, its tabs reaching main when it is let go of (leftOpenNotice). Its clock
// restarts on every browser call its holder makes on it and whenever it is the tab on screen, the one
// the user is looking at or typing in: the placed project's shown tab, not each project's active one,
// which stays set while its browser is hidden. Unused for the setting's minutes, its holder is asked
// once, and not again until the tab is used and goes unused again: an agent that says nothing keeps it.

// The main to ask, by its page, and the tabs it holds that went unused.
export type TabQuestion = { main: number; tabs: BrowserTab[] };

type Use = { usedAt: number; asked: boolean };

const MINUTE_MS = 60_000;

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
    // A browser call by the pane on the tab. Only its holder's counts: another pane's call is refused,
    // and polling a tab it cannot have would keep the holder from ever being asked.
    calledOn(browsers: ReadonlyMap<string, BrowserState>, pane: string, tab: number, now: number): void {
      if ([...browsers.values()].some((state) => state.tabs.some((each) => each.id === tab && each.holder === pane))) used(tab, now);
    },
    // The mains to ask now, a question each naming its tabs, those marked asked, for the setting's
    // minutes, null never asking. `shown` is the tab on screen, or null. A tab gone is forgotten. A
    // worker's tab is never marked: a worker is never asked, since the question would start a turn
    // that replaces its report and reaches main as one, whether it had finished or not.
    due(browsers: ReadonlyMap<string, BrowserState>, now: number, shown: number | null, minutes: number | null): TabQuestion[] {
      const open = new Set<number>();
      const byMain = new Map<number, BrowserTab[]>();
      if (shown !== null) used(shown, now);
      for (const state of browsers.values()) {
        for (const tab of state.tabs) {
          open.add(tab.id);
          const use = uses.get(tab.id);
          const main = tab.holder === 'user' ? null : mainSlotOf(tab.holder);
          if (!use || use.asked || minutes === null || main === null || now - use.usedAt < minutes * MINUTE_MS) continue;
          use.asked = true;
          const tabs = byMain.get(main) ?? [];
          tabs.push(tab);
          byMain.set(main, tabs);
        }
      }
      for (const id of uses.keys()) if (!open.has(id)) uses.delete(id);
      return [...byMain].map(([main, tabs]) => ({ main, tabs }));
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

// Who is told, and what, when a pane is let go of still holding tabs: `main`, the main the worker
// reports to, that they stay open and are the user's. Its agent is gone, so nobody is asked; nothing
// when it held none, or when it is a main itself.
export function leftOpenNotice(browsers: ReadonlyMap<string, BrowserState>, pane: string, main: number): { main: number; text: string } | null {
  const tabs = [...browsers.values()].flatMap((state) => state.tabs.filter((tab) => tab.holder === pane));
  if (tabs.length === 0 || mainSlotOf(pane) !== null) return null;
  return {
    main,
    text: [`Pane ${pane} was let go of still holding these browser tabs. They are left open and are the user's now:`, ...tabs.map(indented)].join('\n'),
  };
}
