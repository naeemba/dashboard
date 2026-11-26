import { describe, expect, it } from 'vitest';
import type { BrowserState, BrowserTab } from '../../shared/browser/browser';
import { isAppQuestion } from '../workers/app-question';
import { idleQuestion, leftOpenNotice, mainSlotOf, tabClock, turnEndQuestion } from './tab-idle';

const MINUTE = 60_000;
const IDLE = 30 * MINUTE;
const tab = (id: number, holder = '2:0'): BrowserTab => ({ id, url: `https://example.com/${id}`, title: '', holder });
const browsers = (tabs: BrowserTab[], active: number | null = null) => new Map<string, BrowserState>([['/work/api', { tabs, active }]]);
const asked = (questions: { main: number; tabs: BrowserTab[] }[]) => questions.map(({ main, tabs }) => `${main}: ${tabs.map((each) => each.id).join(' ')}`);

describe('tabClock', () => {
  it('asks the holder once about the tabs an agent opened, after they go unused for the setting', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1), tab(2), tab(3, '3:0')], active: null }, 0);
    expect(clock.due(browsers([tab(1), tab(2), tab(3, '3:0')]), IDLE - 1, null, 30)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1), tab(2), tab(3, '3:0')]), IDLE, null, 30))).toEqual(['2: 1 2', '3: 3']);
    expect(clock.due(browsers([tab(1), tab(2), tab(3, '3:0')]), 5 * IDLE, null, 30)).toEqual([]);
  });

  it('never asks about a tab the user opened, even once an agent claims it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, 'user')], active: null }, 0);
    expect(clock.due(browsers([tab(1, '2:0')]), 2 * IDLE, null, 30)).toEqual([]);
  });

  it('keeps a tab\'s first sight: a later state or a call on the user\'s tab changes nothing', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1), tab(2, 'user')], active: null }, 0);
    clock.seen({ tabs: [tab(1), tab(2)], active: null }, 20 * MINUTE);
    clock.calledOn(browsers([tab(1), tab(2)]), '2:0', 2, 20 * MINUTE);
    expect(asked(clock.due(browsers([tab(1), tab(2)]), IDLE, null, 30))).toEqual(['2: 1']);
  });

  it('asks nothing about a tab handed back to the user, or with no idle setting', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: null }, 0);
    expect(clock.due(browsers([tab(1)]), 2 * IDLE, null, null)).toEqual([]);
    expect(clock.due(browsers([tab(1, 'user')]), 2 * IDLE, null, 30)).toEqual([]);
  });

  it('restarts the clock on a browser call, and asks again only after the tab goes unused again', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: null }, 0);
    clock.calledOn(browsers([tab(1)]), '2:0', 1, 20 * MINUTE);
    expect(clock.due(browsers([tab(1)]), IDLE, null, 30)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)]), 50 * MINUTE, null, 30))).toEqual(['2: 1']);
    clock.calledOn(browsers([tab(1)]), '2:0', 1, 60 * MINUTE);
    expect(asked(clock.due(browsers([tab(1)]), 90 * MINUTE, null, 30))).toEqual(['2: 1']);
  });

  it('never asks about the tab on screen, and counts from when the user moved off it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: 1 }, 0);
    expect(clock.due(browsers([tab(1)], 1), 2 * IDLE, 1, 30)).toEqual([]);
    expect(clock.due(browsers([tab(1)], 1), 2 * IDLE + MINUTE, null, 30)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)], 1), 3 * IDLE, null, 30))).toEqual(['2: 1']);
  });

  it('asks about a project\'s active tab while another tab is on screen', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: 1 }, 0);
    expect(asked(clock.due(browsers([tab(1)], 1), IDLE, 9, 30))).toEqual(['2: 1']);
  });

  it('restarts the clock only on a call by the tab\'s holder', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: null }, 0);
    clock.calledOn(browsers([tab(1)]), '3:0', 1, 20 * MINUTE);
    expect(asked(clock.due(browsers([tab(1)]), IDLE, null, 30))).toEqual(['2: 1']);
    clock.calledOn(browsers([tab(1)]), '2:0', 1, 40 * MINUTE);
    expect(clock.due(browsers([tab(1)]), 60 * MINUTE, null, 30)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)]), 70 * MINUTE, null, 30))).toEqual(['2: 1']);
  });

  it('never asks a worker, and leaves its tab to ask about once a main holds it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, '2:3')], active: null }, 0);
    expect(clock.due(browsers([tab(1, '2:3')]), 2 * IDLE, null, 30)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)]), 2 * IDLE, null, 30))).toEqual(['2: 1']);
  });

  it('restarts a worker\'s tab clock on the call by the main that claimed it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, '2:3')], active: null }, 0);
    clock.calledOn(browsers([tab(1)]), '2:0', 1, 50 * MINUTE);
    expect(clock.due(browsers([tab(1)]), 51 * MINUTE, null, 30)).toEqual([]);
  });

  it('forgets a closed tab, so an id used again starts over', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, 'user')], active: null }, 0);
    clock.due(browsers([]), MINUTE, null, 30);
    clock.seen({ tabs: [tab(1)], active: null }, MINUTE);
    expect(asked(clock.due(browsers([tab(1)]), MINUTE + IDLE, null, 30))).toEqual(['2: 1']);
  });
});

describe('a worker\'s turn ending', () => {
  const held = [tab(1, '2:3'), tab(2, '2:3'), tab(3, '2:4'), tab(4, 'user')];

  it('asks about the tabs it holds that an agent opened, but the one on screen, once until it uses one', () => {
    const clock = tabClock();
    clock.seen({ tabs: [...held, tab(5, 'user')], active: null }, 0);
    const all = browsers([...held, tab(5, '2:3')]);
    expect(clock.ended(all, '2:3', 2).map((each) => each.id)).toEqual([1]);
    expect(clock.ended(all, '2:3', null).map((each) => each.id)).toEqual([2]);
    expect(clock.ended(all, '2:3', null)).toEqual([]);
    clock.calledOn(all, '2:3', 1, MINUTE);
    expect(clock.ended(all, '2:3', null).map((each) => each.id)).toEqual([1]);
  });

  it('does not ask again about a tab asked about at a turn end, until it is used, whoever holds it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, '2:3')], active: null }, 0);
    clock.ended(browsers([tab(1, '2:3')]), '2:3', null);
    expect(clock.due(browsers([tab(1)]), 2 * IDLE, null, 30)).toEqual([]);
  });

  it('opens with the line that keeps its answer out of the worker\'s report', () => {
    expect(isAppQuestion(turnEndQuestion([tab(4)]))).toBe(true);
    expect(isAppQuestion(idleQuestion([tab(4)], 30))).toBe(true);
    expect(turnEndQuestion([tab(4)])).toContain('these browser tabs.\n  4  https://example.com/4\n');
  });
});

describe('the wording', () => {
  it('names each tab, with its title when it has one', () => {
    const tabs = [tab(4), { ...tab(7), title: ' Jobs ' }];
    expect(idleQuestion(tabs, 30)).toContain('not been used for 30 minutes.\n  4  https://example.com/4\n  7  https://example.com/7  Jobs\n');
  });
});

describe('leftOpenNotice', () => {
  it('tells the main the pane reports to which tabs it still held, in every project', () => {
    const all = new Map<string, BrowserState>([
      ['/work/api', { tabs: [tab(4, '2:3'), tab(5, 'user')], active: null }],
      ['/work/web', { tabs: [{ ...tab(7, '2:3'), title: 'Jobs' }], active: 7 }],
    ]);
    expect(leftOpenNotice(all, '2:3', 5)).toEqual({
      main: 5,
      text: 'Pane 2:3 was let go of still holding these browser tabs. They are left open and are the user\'s now:\n  4  https://example.com/4\n  7  https://example.com/7  Jobs',
    });
  });

  it('tells nobody when the pane held none, or is the main itself', () => {
    expect(leftOpenNotice(browsers([tab(4, 'user')]), '2:3', 2)).toBeNull();
    expect(leftOpenNotice(browsers([tab(4, '2:0')]), '2:0', 2)).toBeNull();
  });
});

describe('mainSlotOf', () => {
  it('names the page of a main session, and nothing for a worker pane', () => {
    expect(mainSlotOf('2:0')).toBe(2);
    expect(mainSlotOf('2:3')).toBeNull();
  });
});
