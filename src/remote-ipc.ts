import type { BrowserWindow } from 'electron';
import { LOCAL_SCREEN } from './screens';
import type { Channels, RemoteTarget } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import { connectRemote, type RemoteClient } from './remote-client';
import { reachesLocalScreen, stampHost, stampReply } from './remote-protocol';
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
}): { current(): RemoteTarget | null; reachesWindow(channel: string): boolean } {
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
        push: (channel, args) => window.send(channel, ...stampHost(channel, args, address)),
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

  // What registerWithIpc relays through. The reply to an open carries the list, so it is stamped like the push.
  function current(): RemoteTarget | null {
    const joined = client;
    if (!joined) return null;
    return {
      invoke: async (channel, args) => stampReply(channel, await joined.invoke(channel, args), joined.address),
      send: (channel, args) => joined.send(channel, args),
    };
  }

  return { current, reachesWindow: (channel) => reachesLocalScreen(channel, client !== null || connecting) };
}

// `--remote` on the command line: join the remembered host as soon as the page can hear the push. A
// refusal is held for the status bar rather than thrown, because the launch itself went fine.
export function connectAtLaunch(
  window: BrowserWindow | undefined, argv: string[], settings: Settings, table: Channels, hold: (message: string) => void,
): void {
  if (!window || !argv.includes('--remote') || settings.remote.address === '') return;
  window.webContents.once('did-finish-load', () => {
    void table.invoke(LOCAL_SCREEN, 'host:connect', [settings.remote.address, settings.remote.token])
      .then((refusal) => { if (refusal) hold(String(refusal)); });
  });
}
