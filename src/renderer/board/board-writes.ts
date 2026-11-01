import type { Board } from './board';
import type { DashboardBridge } from './bridge';

// The app's own board writes, reported to whoever asks. board-watch.ts says why main stays quiet about
// a write the app made, so this is how a listener hears of one.

export type BoardWrites = {
  // The bridge to hand every screen that writes a board, so no write goes around the report.
  bridge: DashboardBridge;
  onWrite(listener: (projectPath: string) => void): void;
};

export function reportBoardWrites(bridge: DashboardBridge): BoardWrites {
  const listeners: ((projectPath: string) => void)[] = [];
  // Defined rather than assigned: the bridge contextBridge hands the page is frozen, and assigning
  // over a frozen prototype's property throws in strict mode. Every other call reaches the original.
  const reporting: DashboardBridge = Object.create(bridge, {
    writeBoard: {
      value: (projectPath: string, board: Board) => {
        const written = bridge.writeBoard(projectPath, board);
        // Beside the write, not inside it: a listener that throws is its own failure, and the board
        // still says it saved. Only a write that landed is reported; a failed one left the file as it
        // was, and the caller hears of it through `written`.
        void written.then(() => {
          for (const listener of listeners) listener(projectPath);
        }, () => undefined);
        return written;
      },
    },
  });
  return {
    bridge: reporting,
    onWrite: (listener) => { listeners.push(listener); },
  };
}
