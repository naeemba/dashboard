import { editorArguments } from '../../shared/panes/shell';
import { EDITOR_INDEX, paneFromId, sizeOfPane } from '../../shared/panes/terminals';
import { editorSocket, removeSocket } from '../nvim/nvim-remote';
import { paneKey } from './pane-host-protocol';
import { paneScreenCopy, type PaneScreenCopy } from './pane-screen-copy';
import type { PaneHost } from './pane-host-client';
import { foregroundName, spawnShell, type PaneShell } from './pane-shell';
import type { PaneCommand } from '../../shared/panes/pane-reading';
import type { Screens } from '../../shared/remote-host/screens';

// Every pane's shell as main holds it: a worker's spawned through the pane host or taken back from it
// after a restart, the editor's spawned in this process, and listened to the one way every way.
// Main-process spawning, out of main.ts because main had reached its 600-line ceiling; main hands
// over what only it has.
export function paneShells(main: {
  host: PaneHost;
  commands: ReadonlyMap<string, PaneCommand>;
  screens: Screens;
  environment: Record<string, string>;
  temporary: string;
  shellCommand(): string;
  projectPath(slot: number): string | undefined;
  send(channel: string, ...payload: unknown[]): void;
  // A pane's own shell ended: what main logs and releases for it.
  ended(id: string, exitCode: number): void;
}) {
  const shells = new Map<string, PaneShell>();
  const screenCopies = new Map<string, PaneScreenCopy>();
  // The shell each pane was actually spawned with, written when the pty starts. Not the shell command
  // setting: that is live, and changing it leaves every already-running pane on the shell it started
  // with — which is what the settings screen tells you. A ship reads what the pty says is in the
  // foreground against this, so switching the setting cannot make five panes sitting at prompts read
  // as running a program and refuse every ship after it.
  const startedWith = new Map<string, string>();

  function spawn(id: string): void {
    const entry = main.commands.get(id);
    if (entry === undefined) return;
    const shellCommand = main.shellCommand();
    // The editor's socket is named after the slot, so the pane that is restarted listens where the
    // same pane listened before and nothing has to be told the name again. Anything left behind by a
    // previous run — a crash, a kill -9 — is cleared first: nvim refuses to listen on a path that
    // already exists, and the pane would show a one-line error instead of an editor.
    let paneArguments = entry.args;
    if (paneArguments === 'editor') {
      const socket = editorSocket(main.temporary, paneFromId(id).slot);
      removeSocket(socket);
      paneArguments = editorArguments(shellCommand, socket);
    }
    // The editor runs in this process, never the host: no launch could reach its nvim again
    // (adopted-pane.ts), so kept it would only hold its buffers and swap file until the next launch.
    const spawnPane = entry.args === 'editor' ? spawnShell : main.host.spawn;
    let shell: PaneShell;
    try {
      const { cols, rows } = sizeOfPane(main.screens, id);
      const { slot, index } = paneFromId(id);
      shell = spawnPane({
        key: paneKey(main.projectPath(slot) ?? '', index),
        file: shellCommand, args: paneArguments, cwd: entry.directory, env: main.environment, cols, rows,
      });
    } catch {
      // The shell itself may be missing — a stale SHELL_COMMAND, say. The pane shows the same exit line
      // a dead shell shows, rather than the spawn taking the window down. A missing nvim is not this
      // case: the shell starts, fails to find it, and exits 127 on its own.
      screenCopies.get(id)?.exit(127);
      main.send('pty:exit', id, 127);
      return;
    }
    listenTo(id, shell, shellCommand);
  }

  // A pane's shell from now on, spawned or kept by the pane host through a restart. Every pane's shell
  // comes through here, so the one line recording what it started with covers every pane there is.
  function listenTo(id: string, shell: PaneShell, shellUsed: string): void {
    startedWith.set(id, shellUsed);
    const copy = paneScreenCopy(() => shell);
    screenCopies.set(id, copy);
    shell.onData((data) => { copy.push(data); main.send('pty:data', id, data); });
    shell.onExit(({ exitCode }) => {
      // Only when this is still the pane's shell. A ship kills the shell in the pane it takes and
      // starts the agent in the same tick, and the killed shell's exit arrives after that: without the
      // check it would drop the agent out of the map, leaving nothing for your keystrokes to reach, and
      // tell the renderer a pane that is busy working had died.
      if (shells.get(id) !== shell) return;
      shells.delete(id);
      main.ended(id, exitCode);
      copy.exit(exitCode);
      main.send('pty:exit', id, exitCode);
    });
    shells.set(id, shell);
  }

  // What the pty says is in the foreground of a pane, or nothing when the pane has no shell.
  //
  // Unix only, which is why win32 answers nothing at all. `IPty.process` is a real foreground reading
  // on unix — node-pty's UnixTerminal calls tcgetpgrp(fd) and names whoever holds the terminal — but
  // WindowsTerminal's getter hands back the pty's *name*, which is the `xterm-256color` spawn asked for
  // and never changes. Passing that on would have every pane on Windows read as running a program
  // called xterm-256color from launch, every ship refused with five of them listed, and no gesture
  // that clears it. Nothing is read there, so nothing is in the way: Windows gets the lowest-free-pane
  // behaviour, and what a ship there can take out from under you is the same corner runsAProgram
  // names, one pane wider.
  function foregroundOf(id: string): string | undefined {
    return process.platform === 'win32' ? undefined : foregroundName(shells.get(id));
  }

  // A pane let go of for good. Out of the map before the kill: the exit arrives afterwards and is
  // dropped by the check in listenTo, so no pty:exit goes out for a pane already off the screen.
  function drop(id: string): void {
    const shell = shells.get(id);
    shells.delete(id);
    shell?.kill();
    screenCopies.delete(id);
    startedWith.delete(id);
  }

  // Whether quitting now kills a shell you could lose work in: a worker pane running in this process
  // this time (no host, another Dashboard holds it, or it died). The editor is always one, and starts
  // fresh either way.
  function workDiesAtQuit(): boolean {
    return [...shells].some(([id, shell]) => diesAtQuit(shell) && paneFromId(id).index !== EDITOR_INDEX);
  }

  return { shells, screenCopies, startedWith, spawn, listenTo, foregroundOf, drop, workDiesAtQuit };
}

// A shell this process runs itself, which will-quit kills. One the pane host runs is left for the next
// launch.
export function diesAtQuit(shell: PaneShell): boolean {
  return shell.kept !== true;
}
