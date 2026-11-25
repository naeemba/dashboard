import { describe, expect, it } from 'vitest';
import { NO_TABS, type BrowserState } from '../../shared/browser/browser';
import { activeTab, appLoad, keyboardOwner, keyboardTaken, mayAsk, namedTab, partitionOf, shownTab, steppedTab, viewBounds, wholeNumber, withoutTab, withTab, withTabChange } from './browser-tabs';

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

  it('hands a closed popup\'s screen back to its opener while that is open', () => {
    expect(withoutTab({ ...three, active: 3 }, 3, 1).active).toBe(1);
    expect(withoutTab({ tabs: [tab(2), tab(3)], active: 3 }, 3, 1).active).toBe(2);
    expect(withoutTab(three, 3, 1).active).toBe(2);
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

describe('viewBounds', () => {
  const placed = { x: 300, y: 80, width: 900, height: 600 };
  const size = { x: 0, y: 0, width: 1280, height: 800 };

  it('draws the tab on screen where the screen put it, whoever holds it', () => {
    expect(viewBounds(tab(2), 2, placed, size)).toEqual(placed);
    expect(viewBounds({ ...tab(2), holder: '3:1' }, 2, placed, size)).toEqual(placed);
  });

  it('draws an agent\'s tab at its size with only its last pixel in the window\'s corner', () => {
    expect(viewBounds({ ...tab(4), holder: '3:1' }, 2, placed, size)).toEqual({ x: -1279, y: -799, width: 1280, height: 800 });
    expect(viewBounds({ ...tab(4), holder: '3:1' }, null, null, size)).toEqual({ x: -1279, y: -799, width: 1280, height: 800 });
  });

  it('hides the person\'s tabs off screen, and a view whose tab is not kept yet', () => {
    expect(viewBounds(tab(1), 2, placed, size)).toBeNull();
    expect(viewBounds(tab(2), null, null, size)).toBeNull();
    expect(viewBounds(tab(2), 2, null, size)).toBeNull();
    expect(viewBounds(undefined, 2, placed, size)).toBeNull();
  });
});

describe('the keyboard a tab takes', () => {
  it('stays with a tab the person focused, and goes back from one a load handed it', () => {
    expect(keyboardTaken(true, false, true)).toBe('kept');
    expect(keyboardTaken(true, true, true)).toBe('given back');
  });

  it('never stays with a tab that is not on screen, which the person cannot reach', () => {
    expect(keyboardTaken(false, false, true)).toBe('given back');
    expect(keyboardTaken(false, true, true)).toBe('given back');
    expect(keyboardTaken(false, false, false)).toBe('given back on return');
  });

  it('waits for the window to have the keyboard before giving it back, so the window is never raised', () => {
    expect(keyboardTaken(true, true, false)).toBe('given back on return');
  });

  it('goes back to the tab the person typed in while it is on screen, else to the window\'s page', () => {
    expect(keyboardOwner(2, 2)).toBe(2);
    expect(keyboardOwner(2, 3)).toBeNull();
    expect(keyboardOwner(2, null)).toBeNull();
    expect(keyboardOwner(null, 2)).toBeNull();
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

describe('a load the app started', () => {
  const start = { isMainFrame: true, isSameDocument: false };

  it('is a whole page in the main frame that no frame started, whether the initiator is left out or null', () => {
    expect(appLoad(start)).toBe(true);
    expect(appLoad({ ...start, initiator: undefined })).toBe(true);
    expect(appLoad({ ...start, initiator: null })).toBe(true);
  });

  it('is not a page\'s own link, a frame inside it, or a move within the page', () => {
    expect(appLoad({ ...start, initiator: {} })).toBe(false);
    expect(appLoad({ ...start, isMainFrame: false })).toBe(false);
    expect(appLoad({ ...start, isSameDocument: true })).toBe(false);
  });
});
