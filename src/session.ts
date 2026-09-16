import { readFileSync, writeFileSync } from 'node:fs';
import { PROJECT_MODES, type Mode } from './modes';
import { TERMINAL_COUNT } from './terminals';

// What a restart puts back: the projects that were open, in the order you cycled them, the view each one
// was left on, and which pane had the keyboard. Not the shells themselves — those die with the app, and
// every pane comes back empty at its project's directory, and what each pane was called.
//
// `names` is one slot per pane of the grid, `null` for a pane nobody named. Not a list of the panes
// that have one: with the panes that do not left out, a name lands on the wrong pane the moment a
// middle pane is unnamed. Only the names you typed are here — a title a program set is gone with the
// program that set it, so a restored pane says nothing until something in it speaks up.
export type SessionPage = { path: string; mode: Mode; focused: number; names: (string | null)[] };
export type Session = { pages: SessionPage[]; activeIndex: number };

const EMPTY: Session = { pages: [], activeIndex: 0 };

// The modes a project can be left on are already spelled once, in modes.ts. Reading them back off
// that list is what keeps a new project view from being restorable everywhere except out of this
// file, and what keeps the manager's modes — which no project can be on — out of a saved page.
function isMode(value: unknown): value is Mode {
  return PROJECT_MODES.some((mode) => mode === value);
}

function isPaneIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TERMINAL_COUNT;
}

// A page is worth restoring only if it says which project it is. Everything else has a sane answer —
// the view a project opens as, the pane it opens on — so a file written by an older version, or edited
// by hand, costs you a detail rather than the whole layout.
function toSessionPage(stored: unknown): SessionPage | null {
  // Destructuring anything that is not an object gives undefined fields, which the path check below
  // already rejects, so the only shape worth guarding against here is the one that would throw.
  const { path, mode, focused, names } = (stored ?? {}) as
    { path?: unknown; mode?: unknown; focused?: unknown; names?: unknown };
  if (typeof path !== 'string' || path === '') return null;
  return {
    path,
    mode: isMode(mode) ? mode : 'terminals',
    focused: isPaneIndex(focused) ? focused : 0,
    // Whether a stored name is worth showing — blank, all spaces — is paneName's to answer, at the one
    // place all three kinds of name arrive. This keeps whatever is text and drops what is not, because
    // anything else in a slot would be drawn on the pane exactly as it is. Its length is not forced to
    // the grid: the restore reads it by pane, so a slot with no pane behind it is skipped anyway.
    names: (Array.isArray(names) ? names : []).map((name) => (typeof name === 'string' ? name : null)),
  };
}

export function parseSession(stored: unknown): Session {
  const { pages, activeIndex } = (stored ?? {}) as { pages?: unknown; activeIndex?: unknown };
  const restored = (Array.isArray(pages) ? pages : []).flatMap((entry) => toSessionPage(entry) ?? []);
  // An activeIndex pointing past the end would open on a page that is not there. First page instead.
  const active = typeof activeIndex === 'number' && Number.isInteger(activeIndex) ? activeIndex : 0;
  return { pages: restored, activeIndex: active >= 0 && active < restored.length ? active : 0 };
}

// Like the recents file, this is a convenience rather than state to recover, reading and writing alike:
// a missing or damaged file just means the window opens empty, and a write that fails must not take
// down whatever the caller was doing.
export function readSession(file: string): Session {
  try {
    return parseSession(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return EMPTY;
  }
}

export function writeSession(file: string, session: Session): void {
  try {
    writeFileSync(file, JSON.stringify(session));
  } catch {
    // Nothing to restore next time.
  }
}
