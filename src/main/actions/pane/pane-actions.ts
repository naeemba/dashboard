import { agentStartEntry, type LogDraft } from '../../../shared/app/log-entry';
import type { PaneCommand } from '../../../shared/panes/pane-reading';
import { paneFromId } from '../../../shared/panes/terminals';
import { startPane, type PaneDispatchInput, type PaneDispatchPorts } from './dispatch';

// Main's wiring for the pane actions: what main hands over, and pane.dispatch's ports built on it.
// Out of main.ts, which is at its 600-line ceiling. The claim's branch is tested in pane-actions.test.ts,
// every other decision is dispatch.ts's and tested there.
export type PaneActionsMain = Pick<PaneDispatchPorts, 'platform' | 'shellCommand' | 'newSession'> & {
  // The session command's answers about the pane, forgotten: it is the new agent's.
  forgetAnswers(id: string): void;
  // Main's claim on each pane: the main its worker reports to.
  mainsWorkers: Pick<Map<string, string>, 'set' | 'delete'>;
  command(id: string): PaneCommand | undefined;
  setPaneCommand(id: string, command: PaneCommand): void;
  shells: Pick<Map<string, { kill(): void }>, 'get' | 'has' | 'delete'>;
  spawn(id: string): void;
  // Working from this instant, rather than from the first report that catches its spinner: there is a
  // second or two of Claude Code starting before the spinner exists, and the sweep in between would
  // read the pane as quiet and take the folder away from the agent.
  agentStarted(id: string): void;
  startScreen: PaneDispatchPorts['screen'];
  log(draft: LogDraft): void;
};

export function paneActions(main: PaneActionsMain): { dispatch(input: PaneDispatchInput): void } {
  // The pane's shell started over in the folder, running `args`. The pane keeps its id; the old shell
  // is killed first, since two processes writing to one id is what retargeting a live pane would leave.
  function shellIn(id: string, directory: string, args: string[]): void {
    main.setPaneCommand(id, { args, directory });
    main.shells.get(id)?.kill();
    main.shells.delete(id);
    main.spawn(id);
  }

  const ports: PaneDispatchPorts = {
    platform: main.platform,
    shellCommand: main.shellCommand,
    newSession: main.newSession,
    starting(id, projectPath, dispatcherPath) {
      main.forgetAnswers(id);
      // Set to the main it reports to, or cleared for an agent that is not main's worker.
      if (dispatcherPath === null) main.mainsWorkers.delete(id);
      else main.mainsWorkers.set(id, dispatcherPath);
      main.log(agentStartEntry(projectPath, paneFromId(id).index));
    },
    shellOf: (id) => ({ directory: main.command(id)?.directory, running: main.shells.has(id) }),
    terminal(id, directory, agentArguments) {
      main.agentStarted(id);
      shellIn(id, directory, agentArguments);
    },
    plainShell: (id, directory) => shellIn(id, directory, []),
    screen: main.startScreen,
  };

  // Synchronous, so a throw reaches the caller's catch.
  return { dispatch(input) { startPane(ports, input); } };
}
