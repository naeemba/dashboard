import { readFileSync } from 'node:fs';
import { replaceFile } from '../board/board-store';
import { isPaneConversation, type PaneConversation } from '../workers/claude-resume';
import { PROJECT_MODES, type Mode } from '../../shared/keys/modes';
import type { SessionPage } from '../../shared/app/bridge';

// What a restart puts back: the projects that were open, in the order you cycled them, the view each one
// was left on, and which pane had the keyboard. Not the shells themselves — those die with the app, and
// every pane comes back empty at its project's directory, and what each pane was called, except a pane
// that was running Claude Code, which resumes that conversation. `Session` and `SessionPage`, the
// part the renderer sends, are declared in bridge.ts.

// What is on disk: the layout the renderer sends, plus which Claude Code conversation each terminal was
// running, one entry per pane number like `names`. Main fills these in; the renderer never sees them change.
// claude-resume.ts holds why each entry carries its folder.
export type SavedPage = SessionPage & { claude: (PaneConversation | null)[] };
export type SavedSession = { pages: SavedPage[]; activeIndex: number };

// In the app's userData folder; main writes it, `project init` reads its pages as the open projects.
export const SESSION_FILE = 'session.json';

const EMPTY: SavedSession = { pages: [], activeIndex: 0 };

// The modes a project can be left on are already spelled once, in modes.ts. Reading them back off
// that list is what keeps a new project view from being restorable everywhere except out of this
// file, and what keeps the manager's modes — which no project can be on — out of a saved page.
function isMode(value: unknown): value is Mode {
  return PROJECT_MODES.some((mode) => mode === value);
}

// Any terminal's number. Whether that pane is open when the layout comes back is the restore's to
// answer, since workers come and go between runs.
function isPaneIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// A page is worth restoring only if it says which project it is. Everything else has a sane answer —
// the view a project opens as, the pane it opens on — so a file written by an older version, or edited
// by hand, costs you a detail rather than the whole layout.
function toSessionPage(stored: unknown): SavedPage | null {
  // Destructuring anything that is not an object gives undefined fields, which the path check below
  // already rejects, so the only shape worth guarding against here is the one that would throw.
  const { path, mode, focused, names, claude } = (stored ?? {}) as
    { path?: unknown; mode?: unknown; focused?: unknown; names?: unknown; claude?: unknown };
  if (typeof path !== 'string' || path === '') return null;
  return {
    path,
    mode: isMode(mode) ? mode : 'terminals',
    focused: isPaneIndex(focused) ? focused : 0,
    // Whether a stored name is worth showing — blank, all spaces — is paneName's to answer, at the one
    // place all three kinds of name arrive. This keeps whatever is text and drops what is not, because
    // anything else in an entry would be drawn on the pane exactly as it is. Its length is not forced to
    // the panes: the restore reads it by pane, so an entry with no pane behind it is skipped anyway.
    names: (Array.isArray(names) ? names : []).map((name) => (typeof name === 'string' ? name : null)),
    // An entry that is not a whole one is no conversation at all, never half of one: its id is typed into a
    // shell. A file written before the field existed resumes nothing.
    claude: (Array.isArray(claude) ? claude : []).map((conversation) => (isPaneConversation(conversation) ? conversation : null)),
  };
}

export function parseSession(stored: unknown): SavedSession {
  const { pages, activeIndex } = (stored ?? {}) as { pages?: unknown; activeIndex?: unknown };
  const restored = (Array.isArray(pages) ? pages : []).flatMap((entry) => toSessionPage(entry) ?? []);
  // An activeIndex pointing past the end would open on a page that is not there. First page instead.
  const active = typeof activeIndex === 'number' && Number.isInteger(activeIndex) ? activeIndex : 0;
  return { pages: restored, activeIndex: active >= 0 && active < restored.length ? active : 0 };
}

// Like the recents file, this is a convenience rather than state to recover, reading and writing alike:
// a missing or damaged file just means the window opens empty, and a write that fails must not take
// down whatever the caller was doing.
export function readSession(file: string): SavedSession {
  try {
    return parseSession(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return EMPTY;
  }
}

export function writeSession(file: string, session: SavedSession): void {
  try {
    replaceFile(file, JSON.stringify(session));
  } catch {
    // Nothing to restore next time.
  }
}
