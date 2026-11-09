import { agentStartEntry, type LogDraft } from '../../../shared/app/log-entry';
import type { PaneCommand } from '../../../shared/panes/pane-reading';
import { paneFromId } from '../../../shared/panes/terminals';
import { bind, type BoundAction } from '../action';
import { notStoppedText, paneClose, type PaneClosePorts } from './close';
import { paneDispatch, type PaneDispatchPorts } from './dispatch';
import { paneOpen, type PaneOpenPorts } from './open';
import { paneRestore, type PaneRestorePorts } from './restore';
import { paneSend, type PaneSendPorts } from './send';

// Main's wiring for the pane actions: what main hands over, and each action's ports built on it. Out of
// main.ts, which is at its 600-line ceiling. pane.claim and pane.release are bound by the session
// command (session-requests.ts), whose ledger of who claimed what they need. The claim on main's worker
// is tested in pane-actions.test.ts, every other decision in its action's own test.
export type PaneActionsMain = Pick<PaneDispatchPorts, 'platform' | 'shellCommand' | 'newSession'>
  & Omit<PaneClosePorts, 'project'> & Pick<PaneOpenPorts, 'project'> & PaneSendPorts
  & Omit<PaneRestorePorts, 'dispatch' | 'mainsWorkers' | 'hasCommand' | 'reserve'> & {
    // The session command's answers about the pane, forgotten: it is the new agent's.
    forgetAnswers(id: string): void;
    // Main's claim on each pane: the main its worker reports to.
    mainsWorkers: Pick<Map<string, string>, 'set' | 'delete'>;
    commands: Pick<Map<string, PaneCommand>, 'get' | 'has' | 'set'>;
    shells: Pick<Map<string, { kill(): void }>, 'get' | 'has' | 'delete'>;
    // Working from this instant, rather than from the first report that catches its spinner: there is a
    // second or two of Claude Code starting before the spinner exists, and the sweep in between would
    // read the pane as quiet and take the folder away from the agent.
    agentStarted(id: string): void;
    startScreen: PaneDispatchPorts['screen'];
    log(draft: LogDraft): void;
  };

export type PaneActions = {
  dispatch: BoundAction;
  open: BoundAction<{ output: string; index: number }>;
  close: BoundAction;
  send: BoundAction;
  restore: BoundAction;
};

export function paneActions(main: PaneActionsMain): PaneActions {
  // The pane's shell started over in the folder, running `args`. The pane keeps its id; the old shell
  // is killed first, since two processes writing to one id is what retargeting a live pane would leave.
  // Its scope is stopped once the new shell has one of its own (each start is named afresh), so what
  // the old shell detached ends with it, as a close ends it.
  function shellIn(id: string, directory: string, args: string[]): void {
    const replaced = main.scopeOf(id);
    main.setPaneCommand(id, { args, directory });
    main.shells.get(id)?.kill();
    main.shells.delete(id);
    main.spawn(id);
    if (replaced === undefined || replaced === main.scopeOf(id)) return;
    main.stopScope(replaced).catch((error: unknown) => {
      main.log({ level: 'warn', kind: 'pane', action: 'pane.dispatch', message: notStoppedText(replaced, error) });
    });
  }
  const plainShell = (id: string, directory: string) => shellIn(id, directory, []);

  const dispatch = bind(paneDispatch, {
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
    shellOf: (id) => ({ directory: main.commands.get(id)?.directory, running: main.shells.has(id) }),
    terminal(id, directory, agentArguments) {
      main.agentStarted(id);
      shellIn(id, directory, agentArguments);
    },
    plainShell,
    screen: main.startScreen,
  });

  return {
    dispatch,
    open: bind(paneOpen, {
      project: main.project, openPanes: main.openPanes, dispatch: dispatch.call, shell: plainShell,
    }),
    close: bind(paneClose, main),
    send: bind(paneSend, main),
    restore: bind(paneRestore, {
      ...main,
      hasCommand: (id) => main.commands.has(id),
      reserve: (id, directory) => main.commands.set(id, { args: [], directory }),
      dispatch: dispatch.call,
    }),
  };
}
