import type { PaneSize } from '../panes/terminals';

// Every screen looking at the session, and how big each one draws each pane. A shell gets the smallest
// columns and the smallest rows anyone reports, the way tmux does, so nothing is cut off on any screen.
// The host's own window is a screen like the others, named LOCAL_SCREEN.
export const LOCAL_SCREEN = 'local';

// Why a screen may not open the folder dialog, or null when it may. The dialog opens on the host's
// desk, so only the host's own window gets one; any other screen types the path instead.
export function folderDialogRefusal(screen: string): string | null {
  return screen === LOCAL_SCREEN ? null : "Type the folder's path on the host";
}

// Whether the host's own window is told about a push a screen caused. Not when the window caused it
// (it already has what it wrote), and not while it shows another host's session (main's ids collide
// with that host's). Every other screen but the cause hears it from the host's broadcast.
export function windowHears(cause: string, reachesWindow: boolean): boolean {
  return cause !== LOCAL_SCREEN && reachesWindow;
}

// Whether main keeps its own copy of each pane's screen: while a remote screen may join (the host is
// running) or the window shows another host, so either can be redrawn from it on arrival or coming home.
// Otherwise the window draws every pane itself and the copy is a flood's CPU spent for nothing.
export function keepsScreenCopies(hostRunning: boolean, reachesWindow: boolean): boolean {
  return hostRunning || !reachesWindow;
}

export type Screens = {
  resize(screen: string, paneId: string, size: PaneSize): void;
  forget(screen: string): void;
  drop(paneId: string): void;
  sizeOf(paneId: string): PaneSize | undefined;
};

export function screens(): Screens {
  const sizes = new Map<string, Map<string, PaneSize>>();
  return {
    resize(screen, paneId, size) {
      let perPane = sizes.get(screen);
      if (!perPane) sizes.set(screen, (perPane = new Map()));
      perPane.set(paneId, size);
    },
    forget(screen) {
      sizes.delete(screen);
    },
    drop(paneId) {
      for (const perPane of sizes.values()) perPane.delete(paneId);
    },
    sizeOf(paneId) {
      let smallest: PaneSize | undefined;
      for (const perPane of sizes.values()) {
        const size = perPane.get(paneId);
        if (!size) continue;
        smallest = smallest
          ? { cols: Math.min(smallest.cols, size.cols), rows: Math.min(smallest.rows, size.rows) }
          : size;
      }
      return smallest;
    },
  };
}
