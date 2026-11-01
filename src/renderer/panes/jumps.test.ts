import { describe, expect, it, vi } from 'vitest';
import { createJumps } from './jumps';
import type { Need } from './needs-you';
import type { Page } from './page';

// page.ts builds terminals, which need a browser; the jumps only need it to switch a page's view.
vi.mock('./page', () => ({
  showMode: (page: { mode: string }, mode: string) => {
    page.mode = mode;
  },
}));

function fakePage(slot: number, path: string) {
  const aimAt = vi.fn();
  const page = { slot, project: { path }, mode: 'terminals', focused: 0, board: { aimAt } } as unknown as Page;
  return { page, aimAt };
}

function setup() {
  const api = fakePage(1, '/api');
  const web = fakePage(2, '/web');
  const shown: number[] = [];
  const jumps = createJumps({ pages: () => [api.page, web.page], showPage: (position) => shown.push(position) });
  return { api, web, shown, jumps };
}

const need = (target: Need['target'], projectPath = '/web', slot = 2): Need => ({
  kind: target.kind === 'card' ? 'review' : 'asking', slot, project: 'web', projectPath, subject: 'x', since: 0, target,
});

describe('jumpToNeed', () => {
  it('lands on the card on its project\'s board for a card item', () => {
    const { web, shown, jumps } = setup();
    expect(jumps.jumpToNeed(need({ kind: 'card', cardId: 'a' }))).toBe('');
    expect(web.aimAt).toHaveBeenCalledWith('a');
    expect(web.page.mode).toBe('board');
    expect(shown).toEqual([1]);
  });

  it('lands on the pane for a pane item, without touching the board', () => {
    const { web, shown, jumps } = setup();
    expect(jumps.jumpToNeed(need({ kind: 'pane', index: 3 }))).toBe('');
    expect(web.aimAt).not.toHaveBeenCalled();
    expect(web.page.mode).toBe('terminals');
    expect(web.page.focused).toBe(3);
    expect(shown).toEqual([1]);
  });

  it('says so, and goes nowhere, for a card in a project that is not open', () => {
    const { shown, jumps } = setup();
    expect(jumps.jumpToNeed(need({ kind: 'card', cardId: 'a' }, '/closed'))).toBe('That project is not open');
    expect(shown).toEqual([]);
  });
});
