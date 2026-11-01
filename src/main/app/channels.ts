import { ipcMain } from 'electron';
import { isClientChannel } from '../remote-host/remote-protocol';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';

// Every channel main answers, in one table, so two callers can reach them: ipcMain for the host's own
// window, and the websocket for every other screen. The screen a call came from is the first argument,
// because a pane's size is the screen's and so is a banner's click.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChannelHandler = (screen: string, ...args: any[]) => unknown;

export type Channels = {
  handle(channel: string, handler: ChannelHandler): void;
  on(channel: string, handler: ChannelHandler): void;
  invoke(screen: string, channel: string, args: unknown[]): Promise<unknown>;
  dispatch(screen: string, channel: string, args: unknown[]): void;
  handled(): string[];
  listened(): string[];
};

export type RemoteTarget = {
  invoke(channel: string, args: unknown[]): Promise<unknown>;
  send(channel: string, args: unknown[]): void;
};

export function channels(): Channels {
  const handlers = new Map<string, ChannelHandler>();
  const listeners = new Map<string, ChannelHandler>();
  return {
    handle(channel, handler) { handlers.set(channel, handler); },
    on(channel, handler) { listeners.set(channel, handler); },
    // A send arriving as a request, which is how a remote screen sends everything, is dispatched and
    // answered null: it has no reply of its own, but the screen's frame has an id that waits for one.
    async invoke(screen, channel, args) {
      const handler = handlers.get(channel);
      if (handler) return handler(screen, ...args);
      const listener = listeners.get(channel);
      if (!listener) throw new Error(`No such channel: ${channel}`);
      listener(screen, ...args);
      return null;
    },
    dispatch(screen, channel, args) {
      listeners.get(channel)?.(screen, ...args);
    },
    handled: () => [...handlers.keys()],
    listened: () => [...listeners.keys()],
  };
}

// The host's own window reaches the table through ipcMain, as LOCAL_SCREEN. When this app is a client
// of another host, every channel that is not the screen's own goes to that host instead; the table is
// bypassed, not emptied, so disconnecting brings the local session straight back.
export function registerWithIpc(table: Channels, remote: () => RemoteTarget | null): void {
  for (const channel of table.handled()) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      const target = remote();
      return target && !isClientChannel(channel) ? target.invoke(channel, args) : table.invoke(LOCAL_SCREEN, channel, args);
    });
  }
  for (const channel of table.listened()) {
    ipcMain.on(channel, (_event, ...args: unknown[]) => {
      const target = remote();
      if (target && !isClientChannel(channel)) target.send(channel, args);
      else table.dispatch(LOCAL_SCREEN, channel, args);
    });
  }
}
