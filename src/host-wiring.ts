import type * as pty from 'node-pty';
import { resizeShellsToScreens } from './pane-channels';
import type { HeldForRemote } from './remote-ipc';
import { replaySession } from './session-replay';
import { startRemoteHost, type RemoteHost } from './remote-host';
import type { Screens } from './screens';

// What the host needs from the main process, which holds all of it. Out of main.ts because main had
// reached its 600-line ceiling; this is only the plumbing between the two.
export type HeldByMain = HeldForRemote & { shells: Map<string, pty.IPty>; screens: Screens; hold(message: string): void };

// After the join replay a screen gets the same pushes as everyone. A screen that leaves stops voting
// on pane sizes, so the shells are resized to whoever is left. No port in the settings means the host
// is off, and nothing listens.
export function startHost(held: HeldByMain): RemoteHost | null {
  const { port } = held.settings().host;
  return port === null ? null : startRemoteHost(port, {
    table: held.table,
    token: () => held.settings().host.token,
    version: held.version,
    onJoin: (_screen, send) => replaySession(held, send),
    onLeave(screen) {
      held.screens.forget(screen);
      resizeShellsToScreens(held.shells, held.screens);
    },
    log: held.log,
    hold: held.hold,
  });
}
