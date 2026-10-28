// The last size this screen reported for each pane. The host forgets a screen's sizes when its socket
// drops, and the renderer only reports a size when the window changes, so after a reconnect these are
// sent again; without them every shell snaps to the host window's width.
// ponytail: a closed pane's size is kept and resent; harmless, the host records it against a pane that
// is either gone or reported afresh when the renderer draws it.
export type SentSizes = { remember(channel: string, args: unknown[]): void; all(): unknown[][] };

export function sentSizes(): SentSizes {
  const byPane = new Map<unknown, unknown[]>();
  return {
    remember(channel, args) {
      if (channel === 'pty:resize') byPane.set(args[0], args);
    },
    all: () => [...byPane.values()],
  };
}
