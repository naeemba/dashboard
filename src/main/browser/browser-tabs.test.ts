import { describe, expect, it } from 'vitest';
import { NO_TABS, type BrowserState } from '../../shared/browser/browser';
import { activeTab, mayAsk, namedTab, partitionOf, shownTab, steppedTab, wholeNumber, withoutTab, withTab, withTabChange } from './browser-tabs';

const tab = (id: number) => ({ id, url: 'about:blank', title: '', holder: 'user' });
const three: BrowserState = { tabs: [tab(1), tab(2), tab(3)], active: 2 };

describe('the tab list', () => {
  it('puts a new tab at the end, on screen', () => {
    expect(withTab(NO_TABS, tab(1))).toEqual({ tabs: [tab(1)], active: 1 });
    expect(withTab(three, tab(4)).active).toBe(4);
  });

  it('puts an agent\'s tab behind the one on screen, or on screen when there is none', () => {
    const agents = { ...tab(4), holder: '3:1' };
    expect(withTab(three, agents).active).toBe(2);
    expect(withTab(NO_TABS, agents).active).toBe(4);
  });

  it('hands a closed tab\'s screen to the one after it, else the one before', () => {
    expect(withoutTab(three, 2).active).toBe(3);
    expect(withoutTab({ ...three, active: 3 }, 3).active).toBe(2);
    expect(withoutTab({ tabs: [tab(1)], active: 1 }, 1)).toEqual(NO_TABS);
  });

  it('keeps the tab on screen when another one closes', () => {
    expect(withoutTab(three, 1)).toEqual({ tabs: [tab(2), tab(3)], active: 2 });
  });

  it('steps round the ends', () => {
    expect(steppedTab(three, 1)).toBe(3);
    expect(steppedTab({ ...three, active: 3 }, 1)).toBe(1);
    expect(steppedTab({ ...three, active: 1 }, -1)).toBe(3);
    expect(steppedTab(NO_TABS, 1)).toBeNull();
  });

  it('changes only the tab named', () => {
    expect(withTabChange(three, 2, { title: 'Docs' }).tabs.map((each) => each.title)).toEqual(['', 'Docs', '']);
  });

  it('answers the same state when nothing changes, so a title set again sends nothing', () => {
    expect(withTabChange(three, 2, { title: '' })).toBe(three);
    expect(withTabChange(three, 9, { title: 'Docs' })).toBe(three);
  });

  it('reads a tab id from the screen or the command', () => {
    expect(wholeNumber(3)).toBe(3);
    expect(wholeNumber('3')).toBe(3);
    for (const value of [undefined, null, '', ' ', 'three', 1.5]) expect(wholeNumber(value)).toBeNull();
  });

  it('refuses a tab the project does not have', () => {
    expect(namedTab(NO_TABS, 1)).toEqual({ refused: 'this project has no tab open' });
    expect(namedTab(three, 9)).toEqual({ refused: 'there is no tab 9 in this project' });
    expect(namedTab(three, 3)).toBe(3);
  });

  it('answers the tab on screen, or that there is none', () => {
    expect(activeTab(three)).toBe(2);
    expect(activeTab(NO_TABS)).toEqual({ refused: 'this project has no tab open' });
  });
});

describe('shownTab', () => {
  const browsers = new Map([['/work/api', three]]);

  it('is the placed project\'s tab on screen', () => {
    expect(shownTab('/work/api', browsers)).toBe(2);
  });

  it('is none with nothing placed, or a project with no tabs', () => {
    expect(shownTab(null, browsers)).toBeNull();
    expect(shownTab('/work/web', browsers)).toBeNull();
  });
});

describe('partitionOf', () => {
  it('keeps each folder\'s logins on disk, apart from every other folder\'s', () => {
    expect(partitionOf('/work/api')).toMatch(/^persist:browser-[0-9a-f]{16}$/);
    expect(partitionOf('/work/api')).toBe(partitionOf('/work/api'));
    expect(partitionOf('/work/api')).not.toBe(partitionOf('/home/api'));
  });
});

describe('mayAsk', () => {
  it('gives a page the clipboard to write to and nothing else', () => {
    expect(mayAsk('clipboard-sanitized-write')).toBe(true);
    for (const permission of ['media', 'geolocation', 'notifications', 'fullscreen', 'display-capture']) {
      expect(mayAsk(permission)).toBe(false);
    }
  });
});
