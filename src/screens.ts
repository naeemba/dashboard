import type { PaneSize } from './terminals';

// Every screen looking at the session, and how big each one draws each pane. A shell gets the smallest
// columns and the smallest rows anyone reports, the way tmux does, so nothing is cut off on any screen.
// The host's own window is a screen like the others, named LOCAL_SCREEN.
export const LOCAL_SCREEN = 'local';

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
