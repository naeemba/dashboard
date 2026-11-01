import { ranked } from '../../shared/app/fuzzy';
import { baseName } from '../../shared/app/base-name';
import type { DocEntry, SessionList, SessionRecord } from '../../shared/drawer/drawer';

// What the drawer lists and what a key does in it. drawer-view.ts puts it on screen; every rule with a
// branch is here so it has a test.

// One line the arrows walk. Each list's heading is drawn by the view and is not a row: there is
// nothing to press Enter on.
export type DrawerRow =
  | { kind: 'doc'; doc: DocEntry }
  | { kind: 'session'; session: SessionRecord }
  | { kind: 'more' };

// What a session row says beside its label: the worktree it ran in when it was not the project's own
// checkout, so two workers on two cards read apart.
export function sessionDetail(session: SessionRecord, projectPath: string): string {
  return session.directory === projectPath ? 'project' : baseName(session.directory);
}

// The docs, then the sessions, each narrowed to what the filter matches, then Load more when older
// sessions are left. Load more stays while filtering: the filter only searches the rows loaded so far,
// and the row is how to search further back.
export function drawerRows(docs: readonly DocEntry[], sessions: SessionList, query: string, projectPath: string): DrawerRow[] {
  const docRows = ranked([...docs], (doc) => doc.name, query).map((doc): DrawerRow => ({ kind: 'doc', doc }));
  const sessionRows = ranked(sessions.rows, (session) => `${session.label} ${sessionDetail(session, projectPath)}`, query)
    .map((session): DrawerRow => ({ kind: 'session', session }));
  return [...docRows, ...sessionRows, ...(sessions.more ? [{ kind: 'more' } as const] : [])];
}

type DrawerKey = 'close' | 'next' | 'previous' | 'act' | 'rename' | 'swallow' | 'ignore';

// What a keystroke in the drawer does. The drawer's own key closes it, read before the modifier guard
// because it is a modified key (keys-rule-1); so is Tab, which would drop focus into the pane behind.
// F2 renames only a session: a doc's name is its path.
export function drawerKey(key: string, modified: boolean, isToggle: boolean, row: DrawerRow | undefined): DrawerKey {
  if (isToggle) return 'close';
  if (key === 'Tab') return 'swallow';
  if (modified) return 'ignore';
  switch (key) {
    case 'Escape': return 'close';
    case 'ArrowDown': return 'next';
    case 'ArrowUp': return 'previous';
    case 'Enter': return row === undefined ? 'swallow' : 'act';
    case 'F2': return row?.kind === 'session' ? 'rename' : 'ignore';
    default: return 'ignore';
  }
}
