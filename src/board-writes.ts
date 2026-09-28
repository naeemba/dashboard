import type { DashboardBridge } from './bridge';

// The app's own board writes, reported to whoever asks. Main sends no `board:change` for a write the
// app made — the board that wrote it is already drawn — so without this the manager's counts would
// only catch up with a card moved on screen once their last read went old.

export type BoardWrites = {
  // The bridge to hand every screen that writes a board, so no write goes around the report.
  bridge: DashboardBridge;
  onWrite(listener: (projectPath: string) => void): void;
};

export function reportBoardWrites(bridge: DashboardBridge): BoardWrites {
  const listeners: ((projectPath: string) => void)[] = [];
  // The original behind a prototype rather than spread out, so every other call reaches it whether
  // or not its properties can be copied.
  const reporting: DashboardBridge = Object.create(bridge);
  // Only a write that landed: a failed one left the file as it was, and the board says so itself.
  reporting.writeBoard = (projectPath, board) => bridge.writeBoard(projectPath, board).then(() => {
    for (const listener of listeners) listener(projectPath);
  });
  return {
    bridge: reporting,
    onWrite: (listener) => { listeners.push(listener); },
  };
}
