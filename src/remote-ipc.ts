import type { BrowserWindow } from 'electron';
import { LOCAL_SCREEN } from './screens';
import type { Channels, RemoteTarget } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import { connectRemote, type RemoteClient } from './remote-client';
import type { Settings } from './settings';

// The two channels that turn this app into a screen of another host and back. The live client is
// what registerWithIpc asks for on every call; while it is set, every non-local channel goes to it.
export function registerRemote(table: Channels, ports: {
  version: string;
  send(channel: string, ...payload: unknown[]): void;
  settings(): Settings;
  saveSettings(next: Settings): void;
  log(draft: LogDraft): void;
  localProjects(): unknown;    // what projects:change carries when the client goes back to its own session
}): { current(): RemoteTarget | null } {
  let client: RemoteClient | null = null;

  table.handle('host:connect', async (_screen, address: string, token: string): Promise<string> => {
    client?.close();
    client = null;
    try {
      client = await connectRemote(address, token, {
        version: ports.version,
        push: (channel, args) => ports.send(channel, ...args),
        status: (text) => ports.send('host:status', text),
        log: ports.log,
      });
    } catch (error: unknown) {
      return failureText(error);
    }
    ports.saveSettings({ ...ports.settings(), remote: { address, token } });
    ports.log({ level: 'info', kind: 'screen', message: `connected to ${address}` });
    return '';
  });

  table.handle('host:disconnect', () => {
    if (!client) return;
    ports.log({ level: 'info', kind: 'screen', message: `disconnected from ${client.address}` });
    client.close();
    client = null;
    ports.send('projects:change', ports.localProjects());
  });

  return { current: () => client };
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
