import { ranked } from '../../shared/app/fuzzy';
import { baseName } from '../../shared/app/base-name';
import type { DocEntry, SessionList, SessionRecord } from '../../shared/drawer/drawer';

// What the drawer lists and what a key does in it. drawer-view.ts puts it on screen; every rule with a
// branch is here so it has a test.

// One line the arrows walk. Each list's heading is drawn by the view and is not a row: there is
// nothing to press Enter on.
// A doc's depth and label are where it sits in the tree, its file name; filtered, the list is flat and
// the label is its whole path under docs/.
export type DrawerRow =
  | { kind: 'folder'; path: string; name: string; depth: number; open: boolean }
  | { kind: 'doc'; doc: DocEntry; depth: number; label: string }
  | { kind: 'session'; session: SessionRecord }
  | { kind: 'more' };

// What a session row says beside its label: the worktree it ran in when it was not the project's own
// checkout, so two workers on two cards read apart.
export function sessionDetail(session: SessionRecord, projectPath: string): string {
  return session.directory === projectPath ? 'project' : baseName(session.directory);
}

// The docs as a tree: at each level its files, in the order they came (each folder's README first),
// then its folders by name, an open one followed by what is in it.
export function docTree(docs: readonly DocEntry[], open: ReadonlySet<string>): DrawerRow[] {
  const rows: DrawerRow[] = [];
  function walk(prefix: string, depth: number): void {
    const inside = docs.filter((doc) => doc.name.startsWith(prefix)).map((doc) => ({ doc, rest: doc.name.slice(prefix.length) }));
    for (const { doc, rest } of inside) if (!rest.includes('/')) rows.push({ kind: 'doc', doc, depth, label: rest });
    const folders = [...new Set(inside.filter(({ rest }) => rest.includes('/')).map(({ rest }) => rest.split('/')[0]))];
    for (const name of folders.sort((one, other) => one.localeCompare(other))) {
      const folder = prefix + name;
      rows.push({ kind: 'folder', path: folder, name, depth, open: open.has(folder) });
      if (open.has(folder)) walk(`${folder}/`, depth + 1);
    }
  }
  walk('', 0);
  return rows;
}

// The docs, then the sessions, each narrowed to what the filter matches, then Load more when older
// sessions are left. Filtering, the docs are a flat list of every match, closed folders' files
// included. Load more stays while filtering: the filter only searches the rows loaded so far, and the
// row is how to search further back.
export function drawerRows(
  docs: readonly DocEntry[], open: ReadonlySet<string>, sessions: SessionList, query: string, projectPath: string,
): DrawerRow[] {
  const docRows = query === ''
    ? docTree(docs, open)
    : ranked([...docs], (doc) => doc.name, query).map((doc): DrawerRow => ({ kind: 'doc', doc, depth: 0, label: doc.name }));
  const sessionRows = ranked(sessions.rows, (session) => `${session.label} ${sessionDetail(session, projectPath)}`, query)
    .map((session): DrawerRow => ({ kind: 'session', session }));
  return [...docRows, ...sessionRows, ...(sessions.more ? [{ kind: 'more' } as const] : [])];
}

// Left and Right in the tree, as a file manager's: Right opens a closed folder and steps into an open
// one, Left closes an open folder and steps out of anything else to the folder holding it. Returns the
// folder to open or close, if any, and the row to highlight.
export function treeStep(rows: readonly DrawerRow[], index: number, key: 'left' | 'right'): { toggle: string | null; highlight: number } {
  const row = rows[index];
  const stay = { toggle: null, highlight: index };
  if (row === undefined || (row.kind !== 'folder' && row.kind !== 'doc')) return stay;
  if (key === 'right') {
    if (row.kind !== 'folder') return stay;
    // An open folder always has a row under it: a folder is only listed for the docs inside it.
    return row.open ? { toggle: null, highlight: index + 1 } : { toggle: row.path, highlight: index };
  }
  if (row.kind === 'folder' && row.open) return { toggle: row.path, highlight: index };
  for (let above = index - 1; above >= 0; above -= 1) {
    const parent = rows[above];
    if (parent.kind === 'folder' && parent.depth === row.depth - 1) return { toggle: null, highlight: above };
  }
  return stay;
}

type DrawerKey = 'close' | 'next' | 'previous' | 'act' | 'rename' | 'left' | 'right' | 'swallow' | 'ignore';

// What a keystroke in the drawer does. The drawer's own key closes it, read before the modifier guard
// because it is a modified key (keys-rule-1); so is Tab, which would drop focus into the pane behind.
// F2 renames only a session: a doc's name is its path. Left and Right walk the tree only while the
// filter is empty: with text in it the docs are a flat list and the arrows move the caret.
export function drawerKey(key: string, modified: boolean, isToggle: boolean, row: DrawerRow | undefined, filtering: boolean): DrawerKey {
  if (isToggle) return 'close';
  if (key === 'Tab') return 'swallow';
  if (modified) return 'ignore';
  switch (key) {
    case 'Escape': return 'close';
    case 'ArrowDown': return 'next';
    case 'ArrowUp': return 'previous';
    case 'ArrowLeft': return filtering ? 'ignore' : 'left';
    case 'ArrowRight': return filtering ? 'ignore' : 'right';
    case 'Enter': return row === undefined ? 'swallow' : 'act';
    case 'F2': return row?.kind === 'session' ? 'rename' : 'ignore';
    default: return 'ignore';
  }
}
