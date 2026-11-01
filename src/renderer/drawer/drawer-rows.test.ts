import { describe, expect, it } from 'vitest';
import { drawerKey, drawerRows, sessionDetail, type DrawerRow } from './drawer-rows';
import type { SessionRecord } from '../../shared/drawer/drawer';

const PROJECT = '/work/dashboard';
const session = (label: string, directory = PROJECT): SessionRecord => ({
  id: 'ccaaf965-c864-48db-8044-30bf27d93087', label, directory, card: null, startedAt: 1, lastUsedAt: 1,
});
const docs = [{ path: '/work/dashboard/docs/README.md', name: 'README.md' }, { path: '/x', name: 'board/decisions.md' }];

describe('drawerRows', () => {
  it('lists the docs, then the sessions, then Load more when older ones are left', () => {
    const rows = drawerRows(docs, { rows: [session('dashboard-2')], more: true }, '', PROJECT);
    expect(rows.map((row) => row.kind)).toEqual(['doc', 'doc', 'session', 'more']);
    expect(drawerRows(docs, { rows: [], more: false }, '', PROJECT).map((row) => row.kind)).toEqual(['doc', 'doc']);
  });

  it('narrows both lists to what the filter matches and keeps Load more for searching further back', () => {
    const rows = drawerRows(docs, { rows: [session('dashboard-2'), session('drawer work')], more: true }, 'draw', PROJECT);
    expect(rows).toEqual([{ kind: 'session', session: session('drawer work') }, { kind: 'more' }]);
  });
});

describe('sessionDetail', () => {
  it("names the worktree a session ran in, and calls the project's own checkout the project", () => {
    expect(sessionDetail(session('a'), PROJECT)).toBe('project');
    expect(sessionDetail(session('a', '/work/dashboard.worktrees/card-12'), PROJECT)).toBe('card-12');
  });
});

describe('drawerKey', () => {
  const sessionRow: DrawerRow = { kind: 'session', session: session('a') };
  const docRow: DrawerRow = { kind: 'doc', doc: docs[0] };

  it("closes on the drawer's own key even though it is modified, and on Escape", () => {
    expect(drawerKey('D', true, true, docRow)).toBe('close');
    expect(drawerKey('Escape', false, false, docRow)).toBe('close');
  });

  it('leaves every other modified key alone, and keeps Tab from leaving the drawer', () => {
    expect(drawerKey('ArrowDown', true, false, docRow)).toBe('ignore');
    expect(drawerKey('Tab', true, false, docRow)).toBe('swallow');
  });

  it('walks with the arrows, acts on Enter, and renames only a session', () => {
    expect(drawerKey('ArrowDown', false, false, docRow)).toBe('next');
    expect(drawerKey('ArrowUp', false, false, docRow)).toBe('previous');
    expect(drawerKey('Enter', false, false, docRow)).toBe('act');
    expect(drawerKey('Enter', false, false, undefined)).toBe('swallow');
    expect(drawerKey('F2', false, false, sessionRow)).toBe('rename');
    expect(drawerKey('F2', false, false, docRow)).toBe('ignore');
  });
});
