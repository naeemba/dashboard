import type { OpenProjects } from './bridge';
import type { Project } from './projects';

// What the renderer does to its pages when the host says which projects are open. The host owns the
// list, since two screens can open and close projects; each screen gets the list and makes its pages
// match. Pure, so it is tested without a window.
export type PageMove =
  | { kind: 'reset' }
  | { kind: 'remove'; slot: number }
  | { kind: 'build'; slot: number; project: Project };

export function pageMoves(
  current: { slot: number; project: Project }[], currentHost: string, next: OpenProjects,
): PageMove[] {
  const moves: PageMove[] = [];
  // Another host's slot 0 is not this one's: nothing on screen belongs to it.
  const kept = next.host === currentHost ? current : [];
  if (next.host !== currentHost) moves.push({ kind: 'reset' });
  const bySlot = new Map(kept.map((page) => [page.slot, page.project]));
  const slots = new Set([...bySlot.keys(), ...next.projects.keys()]);
  for (const slot of [...slots].sort((first, second) => first - second)) {
    const have = bySlot.get(slot);
    const want = next.projects[slot] ?? null;
    const same = have && want && have.path === want.path && have.missing === want.missing;
    if (same) continue;
    if (have) moves.push({ kind: 'remove', slot });
    if (want) moves.push({ kind: 'build', slot, project: want });
  }
  return moves;
}
