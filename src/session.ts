import { readFileSync, writeFileSync } from 'node:fs';
import { MODE_KEYS, type Mode } from './modes';
import { TERMINAL_COUNT } from './terminals';

// What a restart puts back: the projects that were open, in the order you cycled them, the view each one
// was left on, and which pane had the keyboard. Not the shells themselves — those die with the app, and
// every pane comes back empty at its project's directory.
export type SessionPage = { path: string; mode: Mode; focused: number };
export type Session = { pages: SessionPage[]; activeIndex: number };

const EMPTY: Session = { pages: [], activeIndex: 0 };

// The modes are already spelled once, as what the three mode keys select. Reading them back off that
// list is what keeps a new mode from being restorable everywhere except out of this file.
function isMode(value: unknown): value is Mode {
  return Object.values(MODE_KEYS).some((mode) => mode === value);
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
  const { path, mode, focused } = (stored ?? {}) as { path?: unknown; mode?: unknown; focused?: unknown };
  if (typeof path !== 'string' || path === '') return null;
  return { path, mode: isMode(mode) ? mode : 'terminals', focused: isPaneIndex(focused) ? focused : 0 };
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
