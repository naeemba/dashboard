import { describe, expect, it } from 'vitest';
import type { BrowserState, BrowserTab } from '../../shared/browser/browser';
import { claimFound, heldTab, revokeRefusal, tabLines, withoutPane } from './browser-holds';

const tab = (id: number, holder = 'user', takenFrom?: string): BrowserTab => ({
  id, url: `https://example.com/${id}`, title: '', holder, ...(takenFrom === undefined ? {} : { takenFrom }),
});
const browsers = (api: BrowserTab[], web: BrowserTab[] = []) => new Map<string, BrowserState>([
  ['/work/api', { tabs: api, active: api[0]?.id ?? null }],
  ['/work/web', { tabs: web, active: web[0]?.id ?? null }],
]);

describe('heldTab', () => {
  it('finds a tab the pane holds in whichever project it is', () => {
    expect(heldTab(browsers([tab(1)], [tab(2, '3:1')]), '3:1', 2)).toEqual({ projectPath: '/work/web', tab: tab(2, '3:1') });
  });

  it('refuses a tab that is the user\'s, another pane\'s, or not there', () => {
    const all = browsers([tab(1), tab(2, '3:2')]);
    expect(heldTab(all, '3:1', 1)).toEqual({ refused: 'tab 1 is the user\'s; `browser claim 1` it first' });
    expect(heldTab(all, '3:1', 2)).toEqual({ refused: 'tab 2 is held by pane 3:2' });
    expect(heldTab(all, '3:1', 9)).toEqual({ refused: 'there is no tab 9; `browser tabs` lists them' });
  });

  it('tells the pane the user took the tab back from it', () => {
    expect(heldTab(browsers([tab(1, 'user', '3:1')]), '3:1', 1))
      .toEqual({ refused: 'the user took tab 1 back from this pane; it is theirs now' });
  });
});

describe('claimFound', () => {
  it('lets a pane claim the user\'s tab, or one it already holds', () => {
    expect(claimFound(browsers([tab(1)]), '3:1', 1)).toHaveProperty('projectPath', '/work/api');
    expect(claimFound(browsers([tab(1, '3:1')]), '3:1', 1)).toHaveProperty('projectPath', '/work/api');
  });

  it('refuses another pane\'s tab, and one the user took back from this pane, to this pane only', () => {
    expect(claimFound(browsers([tab(1, '3:2')]), '3:1', 1)).toEqual({ refused: 'tab 1 is held by pane 3:2' });
    const taken = browsers([tab(1, 'user', '3:1')]);
    expect(claimFound(taken, '3:1', 1)).toEqual({ refused: 'the user took tab 1 back from this pane; open a tab of your own' });
    expect(claimFound(taken, '3:2', 1)).toHaveProperty('projectPath');
  });
});

describe('revokeRefusal', () => {
  it('has nothing to take back from a tab that is already yours', () => {
    expect(revokeRefusal(tab(1))).toEqual({ refused: 'tab 1 is already yours' });
    expect(revokeRefusal(tab(1, '3:1'))).toBeNull();
  });
});

describe('withoutPane', () => {
  it('hands the pane\'s tabs to the user, open, and forgets what was taken from it', () => {
    const state: BrowserState = { tabs: [tab(1, '3:1'), tab(2, 'user', '3:1'), tab(3, '3:2'), tab(4, 'user', '3:2')], active: 1 };
    expect(withoutPane(state, '3:1')).toEqual({ tabs: [tab(1), tab(2), tab(3, '3:2'), tab(4, 'user', '3:2')], active: 1 });
  });

  it('answers the same state when the pane had nothing there', () => {
    const state: BrowserState = { tabs: [tab(1), tab(2, '3:2')], active: 1 };
    expect(withoutPane(state, '3:1')).toBe(state);
  });
});

describe('tabLines', () => {
  it('names who holds each tab as the asking pane reads it', () => {
    const state: BrowserState = { tabs: [tab(1), { ...tab(2, '3:1'), title: ' Docs ' }, tab(3, '3:2')], active: 1 };
    expect(tabLines(state, '3:1').split('\n')).toEqual([
      '1  the user\'s  https://example.com/1',
      '2  yours  https://example.com/2  Docs',
      '3  pane 3:2  https://example.com/3',
    ]);
    expect(tabLines({ tabs: [], active: null }, '3:1')).toBe('no tab is open in this project');
  });
});
