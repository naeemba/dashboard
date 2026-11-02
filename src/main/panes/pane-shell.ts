import * as pty from 'node-pty';
import type { SpawnRequest } from './pane-host-protocol';

// What the rest of main uses of a pane's shell. node-pty's IPty is one, for a shell this process
// spawned itself; pane-host-client.ts's stand-in is the other, for a shell the pane host runs, and
// only that one is `kept`: quitting leaves it running.
export type PaneShell = {
  readonly pid: number;
  // The program in the pty's foreground, as node-pty names it.
  readonly process: string;
  readonly cols: number;
  readonly rows: number;
  readonly kept?: boolean;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  // Stop and start reading the pty, so a program printing faster than its pane can draw blocks on its
  // own writes: output-pauses.ts.
  pause(): void;
  resume(): void;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number }) => void): unknown;
};

// The one spawn of a pane's pty, in the pane host and in the app when there is no host, so a shell
// started either way sees the same terminal.
export function spawnShell(request: SpawnRequest): PaneShell {
  return pty.spawn(request.file, request.args, {
    name: 'xterm-256color', cols: request.cols, rows: request.rows, cwd: request.cwd, env: request.env,
  });
}

// The pty's foreground program, or nothing. The tty can go between a shell dying and its exit arriving,
// and a pane with nothing running in it is the right answer for a shell that has just died anyway, so a
// reading that fails answers nothing rather than throwing.
export function foregroundName(shell: PaneShell | undefined): string | undefined {
  try {
    return shell?.process;
  } catch {
    return undefined;
  }
}
