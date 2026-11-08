import { agentStartEntry, type LogDraft } from '../../../shared/app/log-entry';
import type { PaneCommand } from '../../../shared/panes/pane-reading';
import { paneFromId } from '../../../shared/panes/terminals';
import type { ScreenStart } from '../../workers/screen-workers';
import { bind, isRefused } from '../action';
import { paneDispatch, type PaneDispatchInput } from './dispatch';

// Main's wiring for the pane actions: what main hands over, and pane.dispatch's two halves built on it.
// Out of main.ts, which is at its 600-line ceiling. Main-process spawning, so no test of its own; the
// decision is dispatch.ts's and tested there.
export type PaneActionsMain = {
  platform: string;
  shellCommand(): string;
  newSession(projectPath: string, directory: string, cardId: string | null): string;
  // The pane is nobody's worker from here on: main's claim on it and the session command's answers
  // about it go. A caller that starts main's worker says so again after the start.
  forget(id: string): void;
  command(id: string): PaneCommand | undefined;
  setPaneCommand(id: string, command: PaneCommand): void;
  shells: Pick<Map<string, { kill(): void }>, 'get' | 'has' | 'delete'>;
  spawn(id: string): void;
  // Working from this instant, rather than from the first report that catches its spinner: there is a
  // second or two of Claude Code starting before the spinner exists, and the sweep in between would
  // read the pane as quiet and take the folder away from the agent.
  agentStarted(id: string): void;
  startScreen(id: string, projectPath: string, directory: string, start: ScreenStart, cardId: string | null, dispatcherPath: string | null): void;
  log(draft: LogDraft): void;
  // A refusal nobody asked to hear, shown the way a failure is.
  hold(message: string): void;
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

  function starting(id: string, projectPath: string): void {
    main.forget(id);
    main.log(agentStartEntry(projectPath, paneFromId(id).index));
  }

  const dispatch = bind(paneDispatch, {
    platform: main.platform,
    shellCommand: main.shellCommand,
    newSession: main.newSession,
    terminal(id, projectPath, directory, agentArguments) {
      starting(id, projectPath);
      main.agentStarted(id);
      shellIn(id, directory, agentArguments);
    },
    // The screen's shell stays a plain one, hidden under it. It is started over only where it does not
    // stand in the screen's folder, so the worktree a ship's pane stood in before is let go of, as a
    // terminal agent's start lets go of it; New Claude's pane, opened there a moment ago, keeps its own.
    screen(id, projectPath, directory, start, cardId, dispatcherPath) {
      starting(id, projectPath);
      if (main.command(id)?.directory !== directory || !main.shells.has(id)) shellIn(id, directory, []);
      main.startScreen(id, projectPath, directory, start, cardId, dispatcherPath);
    },
  });

  return {
    dispatch(input) {
      void dispatch.call(input).then((result) => {
        if (isRefused(result)) main.hold(`The pane did not start: ${result.refused}`);
      });
    },
  };
}
