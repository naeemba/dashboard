import { ipcMain } from 'electron';
import { isClientChannel } from '../remote-host/remote-protocol';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';

// Every channel main answers, in one table, so two callers can reach them: ipcMain for the host's own
// window, and the websocket for every other screen. The screen a call came from is the first argument,
// because a pane's size is the screen's and so is a banner's click.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChannelHandler = (screen: string, ...channelArguments: any[]) => unknown;

export type Channels = {
  // `action` names the action a channel is the screen's door to (registerActions), for the log line a
  // throw leaves.
  handle(channel: string, handler: ChannelHandler, action?: string): void;
  on(channel: string, handler: ChannelHandler): void;
  invoke(screen: string, channel: string, channelArguments: unknown[]): Promise<unknown>;
  dispatch(screen: string, channel: string, channelArguments: unknown[]): void;
  handled(): string[];
  listened(): string[];
  // Told of every handler or listener that throws, with the channel it came in on. The throw still
  // reaches the caller: the screen's own catch says it on the bar, this is the line with main's stack.
  whenThrown(listener: (channel: string, error: unknown, action: string | undefined) => void): void;
};

export type RemoteTarget = {
  invoke(channel: string, channelArguments: unknown[]): Promise<unknown>;
  send(channel: string, channelArguments: unknown[]): void;
};

export function channels(): Channels {
  const handlers = new Map<string, ChannelHandler>();
  const listeners = new Map<string, ChannelHandler>();
  const actions = new Map<string, string>();
  let thrown: (channel: string, error: unknown, action: string | undefined) => void = () => undefined;
  // Every call runs through here, sync throw or rejection alike.
  async function guarded(channel: string, run: () => unknown): Promise<unknown> {
    try {
      return await run();
    } catch (error: unknown) {
      thrown(channel, error, actions.get(channel));
      throw error;
    }
  }
  return {
    handle(channel, handler, action) {
      handlers.set(channel, handler);
      if (action !== undefined) actions.set(channel, action);
    },
    on(channel, handler) { listeners.set(channel, handler); },
    // A send arriving as a request, which is how a remote screen sends everything, is dispatched and
    // answered null: it has no reply of its own, but the screen's frame has an id that waits for one.
    invoke(screen, channel, channelArguments) {
      const handler = handlers.get(channel);
      if (handler) return guarded(channel, () => handler(screen, ...channelArguments));
      const listener = listeners.get(channel);
      if (!listener) return Promise.reject(new Error(`No such channel: ${channel}`));
      return guarded(channel, () => { listener(screen, ...channelArguments); return null; });
    },
    // Synchronous, as ipcMain's listener is: a throw still goes on to the process's last resort, which
    // says it on the bar.
    dispatch(screen, channel, channelArguments) {
      try {
        listeners.get(channel)?.(screen, ...channelArguments);
      } catch (error: unknown) {
        thrown(channel, error, actions.get(channel));
        throw error;
      }
    },
    handled: () => [...handlers.keys()],
    listened: () => [...listeners.keys()],
    whenThrown(listener) { thrown = listener; },
  };
}

// The host's own window reaches the table through ipcMain, as LOCAL_SCREEN. When this app is a client
// of another host, every channel that is not the screen's own goes to that host instead; the table is
// bypassed, not emptied, so disconnecting brings the local session straight back.
export function registerWithIpc(table: Channels, remote: () => RemoteTarget | null): void {
  for (const channel of table.handled()) {
    ipcMain.handle(channel, (_event, ...channelArguments: unknown[]) => {
      const target = remote();
      return target && !isClientChannel(channel) ? target.invoke(channel, channelArguments) : table.invoke(LOCAL_SCREEN, channel, channelArguments);
    });
  }
  for (const channel of table.listened()) {
    ipcMain.on(channel, (_event, ...channelArguments: unknown[]) => {
      const target = remote();
      if (target && !isClientChannel(channel)) target.send(channel, channelArguments);
      else table.dispatch(LOCAL_SCREEN, channel, channelArguments);
    });
  }
}
