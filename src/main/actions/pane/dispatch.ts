import type { Refused } from '../../../shared/app/bridge';
import { agentArguments, agentResumeArguments } from '../../../shared/panes/shell';
import { paneFromId } from '../../../shared/panes/terminals';
import { workerArguments, workerPrompt, workerResumeArguments, workerSessionName } from '../../workers/dispatch';
import { defaultPaneKind, type PaneKind } from '../../workers/pane-kind';
import type { ScreenStart } from '../../workers/screen-workers';
import { action } from '../action';
import { isFilledText, isFilledTextOrNull } from './pane-input';

// Every agent the app starts in a pane goes through here: `pane run`, a ship, the review loop, a resume
// after a restart or from the drawer, and New Claude (workers-decision-8). It decides once whether
// the pane gets a Claude screen or Claude Code in its terminal, and starts the one it chose. A seventh
// caller is a row here.

export type PaneDispatchInput = {
  // The pane, as `2:3`, and the project whose page it is on.
  id: string;
  projectPath: string;
  // Where the agent works: the project, a card's worktree or a throwaway one.
  directory: string;
  // Its first prompt, or null for New Claude: a screen that waits for you to type.
  prompt: string | null;
  // A conversation to carry on (after a restart, from the drawer), or null for a new one.
  resume: string | null;
  cardId: string | null;
  // The page whose main the agent reports to, or null for a Claude opened by hand, which reports to
  // nobody. A ship's and the review loop's agent report to their project's main.
  dispatcherPath: string | null;
  // `pane run --screen` or `--terminal`; for a resume, what the conversation last ran as. Null leaves it
  // to the platform.
  as: PaneKind | null;
};

export type PaneShell = { directory: string | undefined; running: boolean };

export type PaneDispatchPorts = {
  platform: string;
  shellCommand(): string;
  // A new conversation id, recorded in the session index the drawer lists with what it runs as.
  newSession(projectPath: string, directory: string, cardId: string | null, kind: PaneKind): string;
  // A conversation carried on as `kind`, recorded for the next resume of it.
  ranAs(session: string, kind: PaneKind): void;
  // Before either half: the pane is the new agent's, and main's worker when `dispatcherPath` names a main.
  starting(id: string, projectPath: string, dispatcherPath: string | null): void;
  // The folder the pane's shell stands in, and whether one is running.
  shellOf(id: string): PaneShell;
  // The terminal half: the pane's shell started over in the folder, running these arguments.
  terminal(id: string, directory: string, agentArguments: string[]): void;
  // The pane's shell started over as a plain one in the folder, to sit hidden under a screen.
  plainShell(id: string, directory: string): void;
  // The screen half: a Claude screen drawn over the pane (screen-workers.ts).
  screen(id: string, projectPath: string, directory: string, start: ScreenStart, cardId: string | null, dispatcherPath: string | null): void;
};

// New Claude, no prompt and nothing to carry on, is a screen. Anything else is what the door asked for,
// or the platform's default: a resume asks for what the conversation last ran as (the drawer reads the
// session index, a restart's are terminals'), so one of unknown kind opens the way pane run would.
export function paneKind(input: Pick<PaneDispatchInput, 'resume' | 'prompt' | 'as'>, platform: string): PaneKind {
  if (input.prompt === null && input.resume === null) return 'screen';
  return input.as ?? defaultPaneKind(platform);
}

// Whether a screen's hidden shell is started over in its folder first: wherever it is not running there,
// as a terminal agent's start puts its shell there. Every worktree check (the status bar's branch, a
// removal's kill, the sweep's wait) reads the pane's folder off its shell, never off the screen.
export function screenNeedsShell(shell: PaneShell, directory: string): boolean {
  return !shell.running || shell.directory !== directory;
}

export function paneDispatchInput(raw: Record<string, unknown>): PaneDispatchInput | Refused {
  const { id, projectPath, directory, prompt, resume, cardId, dispatcherPath, as } = raw;
  if (!isFilledText(id)) return { refused: 'no pane was given' };
  if (!isFilledText(projectPath) || !isFilledText(directory)) return { refused: 'no folder was given' };
  if (!isFilledTextOrNull(prompt) || !isFilledTextOrNull(resume) || !isFilledTextOrNull(cardId) || !isFilledTextOrNull(dispatcherPath)) {
    return { refused: 'the pane request was not one the app could read' };
  }
  if (as !== null && as !== 'screen' && as !== 'terminal') return { refused: 'a pane runs a screen or a terminal' };
  return { id, projectPath, directory, prompt, resume, cardId, dispatcherPath, as };
}

// The action's whole run, synchronous: every pane it touches is set before the first await, so a door
// that goes on after the call (a restart's next pane, a ship's record) sees the agent started. A throw
// comes back as the call's rejection, which the door awaits into its own catch (a ship's `ship failed`,
// `session run failed`).
export function startPane(ports: PaneDispatchPorts, input: PaneDispatchInput): { output: string } {
  const { id, projectPath, directory, prompt, resume, cardId, dispatcherPath } = input;
  const { index } = paneFromId(id);
  const kind = paneKind(input, ports.platform);
  ports.starting(id, projectPath, dispatcherPath);
  if (resume !== null) ports.ranAs(resume, kind);
  if (kind === 'terminal') {
    ports.terminal(id, directory, terminalArguments(ports, input, index));
    return { output: `started Claude Code in ${id}` };
  }
  if (screenNeedsShell(ports.shellOf(id), directory)) ports.plainShell(id, directory);
  const session = resume ?? ports.newSession(projectPath, directory, cardId, 'screen');
  const first = prompt === null || dispatcherPath === null ? prompt : workerPrompt(prompt, dispatcherPath);
  const start = { session, resume: resume !== null, name: workerSessionName(projectPath, index), prompt: first };
  ports.screen(id, projectPath, directory, start, cardId, dispatcherPath);
  return { output: `started a Claude screen in ${id}` };
}

// Reached through pane-actions.ts by every door: a ship and the review loop (attachPane), `pane run`,
// pane.open (New Claude, the drawer's resume) and pane.restore.
export const paneDispatch = action<PaneDispatchPorts, PaneDispatchInput, { output: string }>('pane.dispatch', {
  words: [],
  input: paneDispatchInput,
  run: async (ports, input) => startPane(ports, input),
});

// What Claude Code in the terminal is started with: a conversation carried on, or a new one, each as
// main's worker with its hooks or as a card's agent. Only a prompt reaches here new (paneKind).
function terminalArguments(ports: PaneDispatchPorts, input: PaneDispatchInput, index: number): string[] {
  const { id, projectPath, directory, prompt, resume, cardId, dispatcherPath } = input;
  const shell = ports.shellCommand();
  if (resume !== null) return dispatcherPath === null ? agentResumeArguments(shell, resume) : workerResumeArguments(shell, id, resume);
  if (prompt === null) throw new Error(`${id} was to start Claude Code with no prompt`);
  const session = ports.newSession(projectPath, directory, cardId, 'terminal');
  if (dispatcherPath === null) return agentArguments(shell, prompt, session);
  return workerArguments(shell, projectPath, id, index, prompt, dispatcherPath, session);
}
