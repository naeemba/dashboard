// What the rest of main uses of a pane's shell. node-pty's IPty is one, for a shell this process
// spawned itself; pane-host-client.ts's stand-in is the other, for a shell the pane host runs.
export type PaneShell = {
  readonly pid: number;
  // The program in the pty's foreground, as node-pty names it.
  readonly process: string;
  readonly cols: number;
  readonly rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number }) => void): unknown;
};
