import type { OpenProjects } from './bridge';
import { clampIndex } from './clamp-index';
import type { Project } from './projects';

// What the renderer does to its pages when the host says which projects are open. The host owns the
// list, since two screens can open and close projects; each screen gets the list and makes its pages
// match. Pure, so it is tested without a window.
export type PageMove =
  | { kind: 'remove'; slot: number }
  // A page whose slot now holds a different project, or the same one back from missing: replaced where
  // it stands, so its tab keeps its place.
  | { kind: 'rebuild'; slot: number; project: Project }
  | { kind: 'build'; slot: number; project: Project };

export function pageMoves(current: { slot: number; project: Project }[], next: OpenProjects): PageMove[] {
  const moves: PageMove[] = [];
  const bySlot = new Map(current.map((page) => [page.slot, page.project]));
  const slots = new Set([...bySlot.keys(), ...next.projects.keys()]);
  for (const slot of [...slots].sort((first, second) => first - second)) {
    const have = bySlot.get(slot);
    const want = next.projects[slot] ?? null;
    const same = have && want && have.path === want.path && have.missing === want.missing;
    if (same) continue;
    if (have && want) moves.push({ kind: 'rebuild', slot, project: want });
    else if (have) moves.push({ kind: 'remove', slot });
    else if (want) moves.push({ kind: 'build', slot, project: want });
  }
  return moves;
}

// Where to stand once the moves are applied, and whether to take the keyboard there. The page you were
// on going or being replaced is a new arrival at a neighbour (or at the new page); otherwise the page
// only shifted along behind removals ahead of it, and stays as it is. `count` is the pages left.
export function landingAfterMoves(
  standingSlot: number | null, moves: PageMove[], positionOfSlot: (slot: number | null) => number,
  activeIndex: number, count: number,
): { position: number; takeFocus: boolean } {
  const position = positionOfSlot(standingSlot);
  if (position === -1) return { position: clampIndex(activeIndex, count - 1), takeFocus: true };
  const touched = moves.some((move) => move.kind !== 'build' && move.slot === standingSlot);
  return { position, takeFocus: touched };
}
