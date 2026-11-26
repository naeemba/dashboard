import { describe, expect, it } from 'vitest';
import type { BrowserState, BrowserTab } from '../../shared/browser/browser';
import { idleQuestion, leftOpenNotice, mainSlotOf, tabClock } from './tab-idle';

const MINUTE = 60_000;
const IDLE = 30 * MINUTE;
const tab = (id: number, holder = '2:3'): BrowserTab => ({ id, url: `https://example.com/${id}`, title: '', holder });
const browsers = (tabs: BrowserTab[], active: number | null = null) => new Map<string, BrowserState>([['/work/api', { tabs, active }]]);
const asked = (questions: { pane: string; tabs: BrowserTab[] }[]) => questions.map(({ pane, tabs }) => `${pane}: ${tabs.map((each) => each.id).join(' ')}`);

describe('tabClock', () => {
  it('asks the holder once about the tabs an agent opened, after they go unused for the setting', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1), tab(2), tab(3, '2:4')], active: null }, 0);
    expect(clock.due(browsers([tab(1), tab(2), tab(3, '2:4')]), IDLE - 1, IDLE)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1), tab(2), tab(3, '2:4')]), IDLE, IDLE))).toEqual(['2:3: 1 2', '2:4: 3']);
    expect(clock.due(browsers([tab(1), tab(2), tab(3, '2:4')]), 5 * IDLE, IDLE)).toEqual([]);
  });

  it('never asks about a tab the user opened, even once an agent claims it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, 'user')], active: null }, 0);
    expect(clock.due(browsers([tab(1, '2:3')]), 2 * IDLE, IDLE)).toEqual([]);
  });

  it('keeps a tab\'s first sight: a later state or a call on the user\'s tab changes nothing', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1), tab(2, 'user')], active: null }, 0);
    clock.seen({ tabs: [tab(1), tab(2)], active: null }, 20 * MINUTE);
    clock.used(2, 20 * MINUTE);
    expect(asked(clock.due(browsers([tab(1), tab(2)]), IDLE, IDLE))).toEqual(['2:3: 1']);
  });

  it('asks nothing about a tab handed back to the user, or with no idle setting', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: null }, 0);
    expect(clock.due(browsers([tab(1)]), 2 * IDLE, null)).toEqual([]);
    expect(clock.due(browsers([tab(1, 'user')]), 2 * IDLE, IDLE)).toEqual([]);
  });

  it('restarts the clock on a browser call, and asks again only after the tab goes unused again', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: null }, 0);
    clock.used(1, 20 * MINUTE);
    expect(clock.due(browsers([tab(1)]), IDLE, IDLE)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)]), 50 * MINUTE, IDLE))).toEqual(['2:3: 1']);
    clock.used(1, 60 * MINUTE);
    expect(asked(clock.due(browsers([tab(1)]), 90 * MINUTE, IDLE))).toEqual(['2:3: 1']);
  });

  it('never asks about the tab on screen, and counts from when the user moved off it', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1)], active: 1 }, 0);
    expect(clock.due(browsers([tab(1)], 1), 2 * IDLE, IDLE)).toEqual([]);
    expect(clock.due(browsers([tab(1)]), 2 * IDLE + MINUTE, IDLE)).toEqual([]);
    expect(asked(clock.due(browsers([tab(1)]), 3 * IDLE, IDLE))).toEqual(['2:3: 1']);
  });

  it('forgets a closed tab, so an id used again starts over', () => {
    const clock = tabClock();
    clock.seen({ tabs: [tab(1, 'user')], active: null }, 0);
    clock.due(browsers([]), MINUTE, IDLE);
    clock.seen({ tabs: [tab(1)], active: null }, MINUTE);
    expect(asked(clock.due(browsers([tab(1)]), MINUTE + IDLE, IDLE))).toEqual(['2:3: 1']);
  });
});

describe('the wording', () => {
  it('names each tab, with its title when it has one', () => {
    const tabs = [tab(4), { ...tab(7), title: ' Jobs ' }];
    expect(idleQuestion(tabs, 30)).toContain('not been used for 30 minutes.\n  4  https://example.com/4\n  7  https://example.com/7  Jobs\n');
  });
});

describe('leftOpenNotice', () => {
  it('tells the pane\'s main which tabs it still held, in every project', () => {
    const all = new Map<string, BrowserState>([
      ['/work/api', { tabs: [tab(4), tab(5, 'user')], active: null }],
      ['/work/web', { tabs: [{ ...tab(7), title: 'Jobs' }], active: 7 }],
    ]);
    expect(leftOpenNotice(all, '2:3')).toEqual({
      main: 2,
      text: 'Pane 2:3 was let go of still holding these browser tabs. They are left open and are the user\'s now:\n  4  https://example.com/4\n  7  https://example.com/7  Jobs',
    });
  });

  it('tells nobody when the pane held none, or is the main itself', () => {
    expect(leftOpenNotice(browsers([tab(4, 'user')]), '2:3')).toBeNull();
    expect(leftOpenNotice(browsers([tab(4, '2:0')]), '2:0')).toBeNull();
  });
});

describe('mainSlotOf', () => {
  it('names the page of a main session, and nothing for a worker pane', () => {
    expect(mainSlotOf('2:0')).toBe(2);
    expect(mainSlotOf('2:3')).toBeNull();
  });
});
