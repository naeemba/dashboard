import { LOCAL_SCREEN } from './screens';
import type { Channels, RemoteTarget } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import { connectRemote, type RemoteClient } from './remote-client';
import { replaySession, type SessionState } from './session-replay';
import type { Settings } from './settings';

// What main holds that the client side reads: the channel table, and this machine's own session for
// the local window to come back to.
export type HeldForRemote = SessionState & {
  table: Channels;
  version: string;
  settings(): Settings;
  log(draft: LogDraft): void;
};

// The two channels that turn this app into a screen of another host and back. The live client is
// what registerWithIpc asks for on every call; while it is set, every non-local channel goes to it.
export function registerRemote(held: HeldForRemote, window: {
  send(channel: string, ...payload: unknown[]): void;
  saveSettings(next: Settings): void;
}): { current(): RemoteTarget | null; reachesWindow(): boolean } {
  let client: RemoteClient | null = null;
  // Each connect takes a number. One that finishes after a newer connect or a disconnect has started
  // is stale, and is closed rather than kept: two live clients would both push into the renderer.
  let generation = 0;
  // A connect that is out has already taken the window from this machine's session: the host's replay
  // can arrive before the connect resolves, and a local push landing among it would draw a local
  // shell's output into the host's pane of the same id.
  let connecting = false;

  // While joined, this machine's own pushes were held back from its window, so coming home it is told
  // everything a screen joining this session would be.
  function backToLocal(): void {
    window.send('host:change', LOCAL_SCREEN);
    replaySession(held, (channel, args) => window.send(channel, ...args));
  }

  held.table.handle('host:connect', async (_screen, address: string, token: string): Promise<string> => {
    const mine = ++generation;
    client?.close();
    client = null;
    connecting = true;
    try {
      const joined = await connectRemote(address, token, {
        version: held.version,
        // The host calls its own list LOCAL_SCREEN, which is what it is from where the host stands. Taken
        // as it comes, this screen would read the host's projects as its own: it would never offer
        // Disconnect, and "a new project" would ask the host for a folder dialog the host refuses. So
        // each list is told whose it is first. Not at the start of the connect: a mistyped token would
        // take every local page down and rebuild it. The window takes a repeat as nothing.
        push(channel, args) {
          if (channel === 'projects:change') window.send('host:change', address);
          window.send(channel, ...args);
        },
        status: (text) => window.send('host:status', text),
        log: held.log,
        // A refused reconnect ends the visit. The client has put the reason on the status line, where
        // it stays; every request would fail from here, so they run locally again.
        gone() {
          if (mine !== generation) return;
          client = null;
          backToLocal();
        },
      });
      if (mine !== generation) {
        joined.close();
        return '';
      }
      client = joined;
    } catch (error: unknown) {
      // The window was held back while the connect was out, and an old host's projects may still be on it.
      if (mine === generation) backToLocal();
      return failureText(error);
    } finally {
      if (mine === generation) connecting = false;
    }
    window.saveSettings({ ...held.settings(), remote: { address, token } });
    held.log({ level: 'info', kind: 'screen', message: `connected to ${address}` });
    return '';
  });

  held.table.handle('host:disconnect', () => {
    generation++;
    const away = client !== null || connecting;
    connecting = false;
    if (client) {
      held.log({ level: 'info', kind: 'screen', message: `disconnected from ${client.address}` });
      client.close();
      client = null;
    }
    if (away) backToLocal();
  });

  // What the local window may be sent by main while this app is a screen of another host: nothing. Its
  // own shells and boards push under pane ids such as `0:1` that collide with the host's, and the host's
  // pushes arrive by the client instead. The app's own notices (a failure, the status line, the host
  // change) and the way back home go to the window directly, not through this gate.
  const reachesWindow = (): boolean => client === null && !connecting;

  // What registerWithIpc relays through.
  return { current: () => client, reachesWindow };
}

// `--remote` on the command line: join the remembered host once the window has put its own session
// back, which the renderer says on `session:restored`. Not on the page load: the restore is still
// opening the saved projects then, and each one it opens after the join is relayed, and lands on the
// host's desk as a tab of a folder that is not there. Waiting for the renderer is simpler than holding
// back the local opens until the connect settles, which would have to tell a restore's open from one
// you asked for. Once per launch: a reloaded page restores again but does not connect again.
// A refusal is held for the status bar rather than thrown, because the launch itself went fine.
export function connectAtLaunch(argv: string[], settings: () => Settings, table: Channels, hold: (message: string) => void): void {
  let waiting = argv.includes('--remote');
  table.on('session:restored', () => {
    const { address, token } = settings().remote;
    if (!waiting || address === '') return;
    waiting = false;
    void table.invoke(LOCAL_SCREEN, 'host:connect', [address, token])
      .then((refusal) => { if (refusal) hold(String(refusal)); });
  });
}
