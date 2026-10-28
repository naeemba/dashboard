import type { OpenProjects, WorktreeList } from './bridge';
import type { PaneRing } from './pane-ring';
import type { UsageSnapshot } from './usage';

export type SessionState = {
  rings: Map<string, PaneRing>;
  projects(): OpenProjects;
  worktrees(): WorktreeList;
  usage(): UsageSnapshot;
};

// What a screen is told when it arrives at this session: the projects, every pane's recent output, the
// worktrees and the token usage. A remote screen hears it on joining; the local window hears it on
// coming back from another host, because while it was away its own pushes were held back from it.
// Its own file so the client side can reach it without importing the host's electron wiring.
export function replaySession(held: SessionState, send: (channel: string, args: unknown[]) => void): void {
  send('projects:change', [held.projects()]);
  for (const [id, ring] of held.rings) send('pty:data', [id, ring.replay()]);
  send('worktree:change', [held.worktrees()]);
  send('usage:change', [held.usage()]);
}
