import type { Refused } from '../../../shared/app/bridge';
import { agentArguments, agentResumeArguments } from '../../../shared/panes/shell';
import { paneFromId } from '../../../shared/panes/terminals';
import { workerArguments, workerPrompt, workerResumeArguments, workerSessionName } from '../../workers/dispatch';
import { hasScreenHost } from '../../workers/screen-host-protocol';
import type { ScreenStart } from '../../workers/screen-workers';
import { action } from '../action';

// Every agent the app starts in a pane goes through here: `pane run`, a ship, the review loop, a resume
// after a restart and New Claude (workers-decision-8). It decides once whether the pane gets a Claude
// screen or Claude Code in its terminal, and starts the one it chose. A sixth caller is a row here.

export type PaneKind = 'screen' | 'terminal';

export type PaneDispatchInput = {
  // The pane, as `2:3`, and the project whose page it is on.
  id: string;
  projectPath: string;
  // Where the agent works: the project, a card's worktree or a throwaway one.
  directory: string;
  // Its first prompt, or null for New Claude: a screen that waits for you to type.
  prompt: string | null;
  // A conversation to carry on after a restart, or null for a new one.
  resume: string | null;
  cardId: string | null;
  // The page whose main the agent reports to, or null: a card's agent reports through the board, and
  // a Claude opened by hand reports to nobody.
  dispatcherPath: string | null;
  // `pane run --screen` or `--terminal`, or New Claude's screen. Null leaves it to the platform.
  as: PaneKind | null;
};

export type PaneDispatchPorts = {
  platform: string;
  shellCommand(): string;
  // A new conversation id, recorded in the session index the drawer lists.
  newSession(projectPath: string, directory: string, cardId: string | null): string;
  // The terminal half: the pane's shell started over in the folder, running these arguments.
  terminal(id: string, projectPath: string, directory: string, agentArguments: string[]): void;
  // The screen half: a Claude screen drawn over the pane (screen-workers.ts).
  screen(id: string, projectPath: string, directory: string, start: ScreenStart, cardId: string | null, dispatcherPath: string | null): void;
};

// A resume is a terminal: a screen comes back through screen-workers.ts on its own, so a conversation
// handed here was a terminal's. No prompt is New Claude, which is a screen. Otherwise what was asked
// for, or a screen wherever the screen host keeps its turn through a quit and a terminal on Windows.
export function paneKind(input: Pick<PaneDispatchInput, 'resume' | 'prompt' | 'as'>, platform: string): PaneKind {
  if (input.resume !== null) return 'terminal';
  if (input.prompt === null) return 'screen';
  return input.as ?? (hasScreenHost(platform) ? 'screen' : 'terminal');
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function textOrNull(value: unknown): value is string | null {
  return value === null || text(value);
}

export function paneDispatchInput(raw: Record<string, unknown>): PaneDispatchInput | Refused {
  const { id, projectPath, directory, prompt, resume, cardId, dispatcherPath, as } = raw;
  if (!text(id)) return { refused: 'no pane was given' };
  if (!text(projectPath) || !text(directory)) return { refused: 'no folder was given' };
  if (!textOrNull(prompt) || !textOrNull(resume) || !textOrNull(cardId) || !textOrNull(dispatcherPath)) {
    return { refused: 'the pane request was not one the app could read' };
  }
  if (as !== null && as !== 'screen' && as !== 'terminal') return { refused: 'a pane runs a screen or a terminal' };
  return { id, projectPath, directory, prompt, resume, cardId, dispatcherPath, as };
}

// Reached from no door yet: main calls it. `run` has no await, so the pane is started by the time
// `call` hands back its promise, and a caller's bookkeeping after the call sees it started.
export const paneDispatch = action<PaneDispatchPorts, PaneDispatchInput, { output: string }>('pane.dispatch', {
  words: [],
  input: paneDispatchInput,
  async run(ports, input) {
    const { id, projectPath, directory, prompt, resume, cardId, dispatcherPath } = input;
    const { index } = paneFromId(id);
    const shell = ports.shellCommand();
    if (paneKind(input, ports.platform) === 'terminal') {
      ports.terminal(id, projectPath, directory, resume !== null
        ? (dispatcherPath === null ? agentResumeArguments(shell, resume) : workerResumeArguments(shell, id, resume))
        : terminalStart(shell, input, ports.newSession(projectPath, directory, cardId)));
      return { output: `started Claude Code in ${id}` };
    }
    const session = ports.newSession(projectPath, directory, cardId);
    const first = prompt === null || dispatcherPath === null ? prompt : workerPrompt(prompt, dispatcherPath);
    ports.screen(id, projectPath, directory, { session, name: workerSessionName(projectPath, index), prompt: first }, cardId, dispatcherPath);
    return { output: `started a Claude screen in ${id}` };
  },
});

// A new conversation in the terminal: main's worker with its hooks, or a card's agent on its prompt.
function terminalStart(shell: string, input: PaneDispatchInput, session: string): string[] {
  const { id, projectPath, prompt, dispatcherPath } = input;
  const words = prompt ?? '';
  return dispatcherPath === null
    ? agentArguments(shell, words, session)
    : workerArguments(shell, projectPath, id, paneFromId(id).index, words, dispatcherPath, session);
}
