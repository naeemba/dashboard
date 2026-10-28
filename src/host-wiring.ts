import type * as pty from 'node-pty';
import type { Channels } from './channels';
import type { LogDraft } from './log-entry';
import type { OpenProjects, WorktreeList } from './bridge';
import type { UsageSnapshot } from './usage';
import type { PaneRing } from './pane-ring';
import { resizeShellsToScreens } from './pane-channels';
import { startHostIfConfigured, type RemoteHost } from './remote-host';
import type { Screens } from './screens';
import type { Settings } from './settings';

// What the host needs from the main process, which holds all of it. Out of main.ts because main had
// reached its 600-line ceiling; this is only the plumbing between the two.
export type HeldByMain = {
  table: Channels;
  settings: () => Settings;
  version: string;
  rings: Map<string, PaneRing>;
  shells: Map<string, pty.IPty>;
  screens: Screens;
  projects(): OpenProjects;
  worktrees(): WorktreeList;
  usage(): UsageSnapshot;
  log(draft: LogDraft): void;
};

// A screen that joins is told what the others were told while it was away: the projects, every pane's
// recent output, the worktrees and the token usage. After that it gets the same pushes as everyone.
// A screen that leaves stops voting on pane sizes, so the shells are resized to whoever is left.
export function startHost(held: HeldByMain): RemoteHost | null {
  return startHostIfConfigured(held.settings().host.port, {
    table: held.table,
    token: () => held.settings().host.token,
    version: held.version,
    onJoin(_screen, send) {
      send('projects:change', [held.projects()]);
      for (const [id, ring] of held.rings) send('pty:data', [id, ring.replay()]);
      send('worktree:change', [held.worktrees()]);
      send('usage:change', [held.usage()]);
    },
    onLeave(screen) {
      held.screens.forget(screen);
      resizeShellsToScreens(held.shells, held.screens);
    },
    log: held.log,
  });
}
