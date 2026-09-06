import { describe, expect, it } from 'vitest';
import { parseSession } from './session';

const page = { path: '/Users/sharp/work/api', mode: 'board', focused: 3 };

describe('parseSession', () => {
  it('keeps a saved layout as it was written', () => {
    expect(parseSession({ pages: [page], activeIndex: 0 }))
      .toEqual({ pages: [{ path: '/Users/sharp/work/api', mode: 'board', focused: 3 }], activeIndex: 0 });
  });

  it('reads nothing out of a file that is not a session', () => {
    expect(parseSession(null)).toEqual({ pages: [], activeIndex: 0 });
    expect(parseSession('[]')).toEqual({ pages: [], activeIndex: 0 });
    expect(parseSession({})).toEqual({ pages: [], activeIndex: 0 });
  });

  // A page with no project cannot be opened, so it goes. The rest of the layout still comes back.
  it('drops a page with no usable path and keeps the others', () => {
    const stored = { pages: [{ mode: 'nvim' }, page, { path: '' }], activeIndex: 1 };
    expect(parseSession(stored).pages).toEqual([{ path: page.path, mode: 'board', focused: 3 }]);
  });

  // Restoring a view that does not exist would leave the page showing nothing at all.
  it('falls back to terminals for a mode it does not know', () => {
    expect(parseSession({ pages: [{ ...page, mode: 'graphs' }] }).pages[0].mode).toBe('terminals');
    expect(parseSession({ pages: [{ ...page, mode: 7 }] }).pages[0].mode).toBe('terminals');
  });

  // focused indexes the pane array directly, so a number off the end would focus undefined.
  it('falls back to the first pane for an index outside the grid', () => {
    expect(parseSession({ pages: [{ ...page, focused: 5 }] }).pages[0].focused).toBe(0);
    expect(parseSession({ pages: [{ ...page, focused: -1 }] }).pages[0].focused).toBe(0);
    expect(parseSession({ pages: [{ ...page, focused: 1.5 }] }).pages[0].focused).toBe(0);
  });

  it('opens on the first page when the saved one is not there', () => {
    expect(parseSession({ pages: [page], activeIndex: 4 }).activeIndex).toBe(0);
    expect(parseSession({ pages: [page], activeIndex: -1 }).activeIndex).toBe(0);
    expect(parseSession({ pages: [], activeIndex: 0 }).activeIndex).toBe(0);
  });

  it('keeps the order the pages were written in, since that is the tab strip', () => {
    const stored = { pages: [{ path: '/a' }, { path: '/b' }, { path: '/c' }], activeIndex: 2 };
    expect(parseSession(stored).pages.map((entry) => entry.path)).toEqual(['/a', '/b', '/c']);
    expect(parseSession(stored).activeIndex).toBe(2);
  });
});
