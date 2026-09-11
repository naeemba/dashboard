import { clampIndex } from './clamp-index';
import type { Mode } from './modes';

// The named views along the top of the manager page, in the order the strip prints them.
//
// This array is the order, and nothing else decides it: the strip draws it, Alt+H and Alt+L walk it,
// and a fourth section is a fourth row here and a view in the renderer. Which section is showing is
// asked of the page's mode rather than kept beside it, because the mode and the view on screen are
// already one fact — a second copy of "which section" is a second thing to keep in step, and it would
// be the one that goes stale.
export const SECTIONS: readonly { name: string; mode: Mode }[] = [
  { name: 'general', mode: 'manager' },
  { name: 'board', mode: 'board' },
  { name: 'command', mode: 'command' },
];

// Where this mode sits on the strip, or -1 for a mode the manager never shows. Board is a mode the
// manager shares with every project, so this alone does not say you are on the manager — the scope of
// the keys does that, and this only says where they land.
export function sectionIndex(mode: Mode): number {
  return SECTIONS.findIndex((section) => section.mode === mode);
}

// Whether a mode is one of the manager's sections at all, asked wherever the question is only "is it
// one" rather than "which one" — actions.ts and shortcuts.ts both need this fact for `manager-page`,
// and each holding its own `sectionIndex(mode) !== -1` is the second copy CLAUDE.md warns about: change
// what counts as a section here and one of the two keeps the old answer.
export function isSection(mode: Mode): boolean {
  return sectionIndex(mode) !== -1;
}

// Where Alt+H and Alt+L land. The strip does not wrap: Alt+H on the first section stays on it, the way
// the manager's own list stops at its last row rather than carrying you back to the top. Holding a key
// to get to the end should stop at the end.
export function nextSectionMode(mode: Mode, direction: 'previous' | 'next'): Mode {
  const index = sectionIndex(mode);
  if (index === -1) return mode;
  return SECTIONS[clampIndex(index + (direction === 'next' ? 1 : -1), SECTIONS.length - 1)].mode;
}
