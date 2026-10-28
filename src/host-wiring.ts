import type * as pty from 'node-pty';
import type { Channels } from './channels';
import type { LogDraft } from './log-entry';
import { resizeShellsToScreens } from './pane-channels';
import { replaySession, type SessionState } from './session-replay';
import { startHostIfConfigured, type RemoteHost } from './remote-host';
import type { Screens } from './screens';
import type { Settings } from './settings';

// What the host needs from the main process, which holds all of it. Out of main.ts because main had
// reached its 600-line ceiling; this is only the plumbing between the two.
export type HeldByMain = SessionState & {
  table: Channels;
  settings: () => Settings;
  version: string;
  shells: Map<string, pty.IPty>;
  screens: Screens;
  log(draft: LogDraft): void;
};

// After the join replay a screen gets the same pushes as everyone. A screen that leaves stops voting
// on pane sizes, so the shells are resized to whoever is left.
export function startHost(held: HeldByMain): RemoteHost | null {
  return startHostIfConfigured(held.settings().host.port, {
    table: held.table,
    token: () => held.settings().host.token,
    version: held.version,
    onJoin: (_screen, send) => replaySession(held, send),
    onLeave(screen) {
      held.screens.forget(screen);
      resizeShellsToScreens(held.shells, held.screens);
    },
    log: held.log,
  });
}
