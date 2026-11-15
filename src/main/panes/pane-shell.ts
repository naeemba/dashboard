import * as pty from 'node-pty';
import { baseName } from '../../shared/app/base-name';
import { SCOPE_RUNNER } from '../../shared/processes/scope-runner';
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
  const { file, args } = request.scope ?? request;
  return pty.spawn(file, args, {
    name: 'xterm-256color', cols: request.cols, rows: request.rows, cwd: request.cwd, env: request.env,
  });
}

// Shells whose pty has named something other than the scope runner at least once.
const pastTheirRunner = new WeakSet<PaneShell>();

// The pty's foreground program, or nothing. The tty can go between a shell dying and its exit arriving,
// and a pane with nothing running in it is the right answer for a shell that has just died anyway, so a
// reading that fails answers nothing rather than throwing.
//
// A shell started in its systemd scope (scope.ts) is first the scope runner, holding the pty until the
// scope is made and it execs the shell, and the first reading can land in that window: counted as a
// program, a pane `pane claim` had just handed out was refused by `pane run` as running systemd-run,
// while `pane list` a moment later said idle. So the runner answers nothing until the pty has named
// anything else. A systemd-run you start yourself usually comes after the shell has been read, which
// marks it: the host reads every pane every 500 ms, and an in-process pane is read on its first output
// (listenTo in pane-shells.ts). One typed before that first reading (`pane run` straight after
// `pane claim`) reads as nothing until it ends: docs/panes/README.md, open questions. A pane host's
// shell (`kept`) was read by the host, which already did this.
export function foregroundName(shell: PaneShell | undefined): string | undefined {
  let name: string | undefined;
  try {
    name = shell?.process;
  } catch {
    return undefined;
  }
  if (shell === undefined || name === undefined || shell.kept === true || pastTheirRunner.has(shell)) return name;
  if (baseName(name) === SCOPE_RUNNER) return undefined;
  pastTheirRunner.add(shell);
  return name;
}
