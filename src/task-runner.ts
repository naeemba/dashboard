import { spawn } from 'node:child_process';
import { tailLines } from './manager';
import { taskArguments } from './shell';
import { finishedTasks, lastPrintableLine, printableLines, type RunningTask, type TaskResult } from './tasks';

// The command screen's processes: starting them, killing them, and saying what each one did. No
// decision of its own lives here — which report to send after a process ends is `tasks.ts`'s
// `finishedTasks`, beside its test — so this is the spawning and the wiring, the way main's own
// handlers are, and it is untested for the same reason they are. It sits apart from `main.ts` because
// it wants nothing from that file but the way to the renderer and the shell to spawn.

export type TaskPorts = {
  // One row's new state, on its way to the renderer.
  send: (result: TaskResult) => void;
  // Asked each time rather than held, because the settings screen can change the shell mid-run and the
  // next command should be the one you just picked.
  shellCommand: () => string;
};

export type TaskRunner = {
  run: (command: string, projectPaths: string[]) => void;
  // The cancel key, and the start of every fresh run.
  cancel: () => void;
  // The app is going away, so there is no row left to tell.
  stop: () => void;
};

export function taskRunner(ports: TaskPorts): TaskRunner {
  // Every process the current run started, each beside the project it is running in. The path is kept
  // here because cancelling has to name every project it stopped — a row told nothing sits on `running`
  // forever, and the process it was waiting for is already dead.
  let runningTasks: RunningTask<ReturnType<typeof spawn>>[] = [];
  // Which run a process belongs to. Without it, killing run 3 and starting run 4 in the same breath lets
  // run 3's dying processes report "cancelled" for projects run 4 has already marked "running" — the
  // row goes backwards in front of you and stays wrong until the next run.
  let currentRun = 0;

  function killTask(child: ReturnType<typeof spawn>): void {
    try {
      // The negative pid is the process group, which is what `detached` bought: `npm audit` spawns
      // children, and killing only the shell leaves them running with nothing on screen naming them.
      // Windows has no process groups to kill this way, so the child goes on its own there.
      if (process.platform === 'win32' || child.pid === undefined) child.kill();
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }

  function stop(): void {
    for (const task of runningTasks) killTask(task.child);
    runningTasks = [];
  }

  // Stop whatever is running and tell every project that it was stopped. Both the cancel key and a
  // fresh run come through here: a new run kills the previous one, and a project the new run does not
  // name would otherwise sit on `running` forever, waiting for a process that is already dead.
  //
  // The paths are read before the processes are killed, and the run number moves with them, so each
  // project is told exactly once — from here, rather than a second time as its own close event arrives.
  function cancel(): void {
    const paths = runningTasks.map((task) => task.projectPath);
    stop();
    currentRun += 1;
    for (const projectPath of paths) {
      ports.send({ projectPath, state: 'cancelled', exitCode: null, lastLine: '', tail: [] });
    }
  }

  // Shared by every way a process can end (failed to start, or exited), rather than repeated in each
  // listener. Both guards live in `finishedTasks` beside their test; this is the wiring that applies
  // what it answers.
  function finishTask(child: ReturnType<typeof spawn>, run: number, result: TaskResult): void {
    const finished = finishedTasks(runningTasks, child, run, currentRun);
    runningTasks = finished.tasks;
    if (finished.send) ports.send(result);
  }

  function run(command: string, projectPaths: string[]): void {
    cancel();
    const runNumber = currentRun;
    const shell = ports.shellCommand();
    for (const projectPath of projectPaths) {
      ports.send({ projectPath, state: 'running', exitCode: null, lastLine: '', tail: [] });
      // Not a pty and not one of the five panes: a command that borrows a shell throws away whatever was
      // in it, which is the whole reason this screen exists rather than sending keystrokes to panes.
      // stdin is closed rather than left as a pipe nobody ever writes to. A command that asks a question
      // would block on an answer that cannot arrive, leaving the row on `running` with nothing on screen
      // saying a question was asked; closed, the same command fails at once and the row shows what it said.
      const child = spawn(shell, taskArguments(shell, command), {
        cwd: projectPath, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
      // Both streams into one buffer. A tool that reports on stderr — most of them, for a summary — would
      // otherwise leave the row showing the last thing it happened to say on stdout.
      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      // The shell itself could not be started. There is no exit code for that, so the row says the one
      // a shell says for a command it cannot find, and the message is what the last line shows.
      child.on('error', (error: Error) => {
        finishTask(child, runNumber, {
          projectPath, state: 'done', exitCode: 127, lastLine: error.message, tail: [error.message],
        });
      });
      child.on('close', (code: number | null, signal: string | null) => {
        finishTask(child, runNumber, {
          projectPath,
          // A signal rather than a code is this app killing it, which is the only thing that sends one
          // here. A command that dies of its own signal is rare enough to read as cancelled.
          state: signal === null ? 'done' : 'cancelled',
          exitCode: code,
          lastLine: lastPrintableLine(output),
          // The same five lines, chosen by the same rule, as the manager's pane rows.
          tail: tailLines(printableLines(output)),
        });
      });
      runningTasks.push({ child, projectPath });
    }
  }

  return { run, cancel, stop };
}
