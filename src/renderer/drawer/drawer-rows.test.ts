import { describe, expect, it } from 'vitest';
import { docTree, drawerKey, drawerRows, sessionDetail, treeStep, type DrawerRow } from './drawer-rows';
import type { SessionRecord } from '../../shared/drawer/drawer';

const PROJECT = '/work/dashboard';
const session = (label: string, directory = PROJECT): SessionRecord => ({
  id: 'ccaaf965-c864-48db-8044-30bf27d93087', label, directory, card: null, startedAt: 1, lastUsedAt: 1,
});
const docs = [{ path: '/work/dashboard/docs/README.md', name: 'README.md' }, { path: '/x', name: 'board/decisions.md' }];
const none = new Set<string>();

describe('drawerRows', () => {
  it('lists the docs, then the sessions, then Load more when older ones are left', () => {
    const rows = drawerRows(docs, none, { rows: [session('dashboard-2')], more: true }, '', PROJECT);
    expect(rows.map((row) => row.kind)).toEqual(['doc', 'folder', 'session', 'more']);
    expect(drawerRows(docs, none, { rows: [], more: false }, '', PROJECT).map((row) => row.kind)).toEqual(['doc', 'folder']);
  });

  it('narrows both lists to what the filter matches and keeps Load more for searching further back', () => {
    const rows = drawerRows(docs, none, { rows: [session('dashboard-2'), session('drawer work')], more: true }, 'draw', PROJECT);
    expect(rows).toEqual([{ kind: 'session', session: session('drawer work') }, { kind: 'more' }]);
  });

  it('finds a doc in a closed folder, listed flat by its whole path', () => {
    const rows = drawerRows(docs, none, { rows: [], more: false }, 'decisions', PROJECT);
    expect(rows).toEqual([{ kind: 'doc', doc: docs[1], depth: 0, label: 'board/decisions.md' }]);
  });
});

describe('docTree', () => {
  const tree = [
    { path: '/d/README.md', name: 'README.md' },
    { path: '/d/board/README.md', name: 'board/README.md' },
    { path: '/d/board/old/a.md', name: 'board/old/a.md' },
    { path: '/d/board/z.md', name: 'board/z.md' },
    { path: '/d/app/README.md', name: 'app/README.md' },
  ];
  const shape = (rows: DrawerRow[]): string[] => rows.map((row) => (row.kind === 'folder'
    ? `${row.depth}:${row.name}/${row.open ? '-' : '+'}` : row.kind === 'doc' ? `${row.depth}:${row.label}` : row.kind));

  it("lists each level's files, then its folders by name, closed until opened", () => {
    expect(shape(docTree(tree, none))).toEqual(['0:README.md', '0:app/+', '0:board/+']);
    expect(shape(docTree(tree, new Set(['board', 'board/old'])))).toEqual(
      ['0:README.md', '0:app/+', '0:board/-', '1:README.md', '1:z.md', '1:old/-', '2:a.md']);
  });

  it('keeps a folder inside a closed one hidden even when it is open', () => {
    expect(shape(docTree(tree, new Set(['board/old'])))).toEqual(['0:README.md', '0:app/+', '0:board/+']);
  });

  it('opens and steps in on Right, closes and steps out on Left', () => {
    const closed = docTree(tree, none);
    expect(treeStep(closed, 2, 'right')).toEqual({ toggle: 'board', highlight: 2 });
    const opened = docTree(tree, new Set(['board']));
    expect(treeStep(opened, 2, 'right')).toEqual({ toggle: null, highlight: 3 });
    expect(treeStep(opened, 2, 'left')).toEqual({ toggle: 'board', highlight: 2 });
    expect(treeStep(opened, 4, 'left')).toEqual({ toggle: null, highlight: 2 });
    expect(treeStep(opened, 0, 'left')).toEqual({ toggle: null, highlight: 0 });
    expect(treeStep(opened, 0, 'right')).toEqual({ toggle: null, highlight: 0 });
  });

  it("lists a folder entry before anything in it is read, and Right on it open stays put", () => {
    const manager = [{ path: '/h/.claude', name: '.claude', folder: true as const }, { path: '/h/.dashboard', name: '.dashboard', folder: true as const }];
    const rows = docTree(manager, new Set(['.claude']));
    expect(shape(rows)).toEqual(['0:.claude/-', '0:.dashboard/+']);
    expect(treeStep(rows, 0, 'right')).toEqual({ toggle: null, highlight: 0 });
    const read = [...manager, { path: '/h/.claude/CLAUDE.md', name: '.claude/CLAUDE.md' }, { path: '/h/.claude/rules', name: '.claude/rules', folder: true as const }];
    expect(shape(docTree(read, new Set(['.claude'])))).toEqual(['0:.claude/-', '1:CLAUDE.md', '1:rules/+', '0:.dashboard/+']);
    expect(drawerRows(read, none, { rows: [], more: false }, 'claude', '').map((row) => row.kind === 'doc' && row.label)).toEqual(['.claude/CLAUDE.md']);
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
  const docRow: DrawerRow = { kind: 'doc', doc: docs[0], depth: 0, label: 'README.md' };

  it("closes on the drawer's own key even though it is modified, and on Escape", () => {
    expect(drawerKey('D', true, true, docRow, false)).toBe('close');
    expect(drawerKey('Escape', false, false, docRow, false)).toBe('close');
  });

  it('leaves every other modified key alone, and keeps Tab from leaving the drawer', () => {
    expect(drawerKey('ArrowDown', true, false, docRow, false)).toBe('ignore');
    expect(drawerKey('Tab', true, false, docRow, false)).toBe('swallow');
  });

  it('walks with the arrows, acts on Enter, and renames only a session', () => {
    expect(drawerKey('ArrowDown', false, false, docRow, false)).toBe('next');
    expect(drawerKey('ArrowUp', false, false, docRow, false)).toBe('previous');
    expect(drawerKey('Enter', false, false, docRow, false)).toBe('act');
    expect(drawerKey('Enter', false, false, undefined, false)).toBe('swallow');
    expect(drawerKey('F2', false, false, sessionRow, false)).toBe('rename');
    expect(drawerKey('F2', false, false, docRow, false)).toBe('ignore');
  });

  it('walks the tree with Left and Right, and leaves them to the caret while filtering', () => {
    expect(drawerKey('ArrowLeft', false, false, docRow, false)).toBe('left');
    expect(drawerKey('ArrowRight', false, false, docRow, false)).toBe('right');
    expect(drawerKey('ArrowRight', false, false, docRow, true)).toBe('ignore');
  });
});
