import { baseName } from './base-name';
import { workerArguments, workerSessionName } from './dispatch';
import { failureText } from './failure';
import { worktreesRoot } from './ship';
import { ranInProject } from './usage';
import { parseSessionCommand, type WorkerState, type SessionReply, type SessionRequest } from './session-cli';
import { MAIN_INDEX, paneFromId, paneLabel, terminalId } from './terminals';

// What main does with a `session` command: every decision, against what main.ts hands over. Nothing
// here holds a pty or runs git; it asks for those through the ports, so the rules can be tested with a
// fake project behind them.

export type SessionPorts = {
  // The open project a folder is in — its checkout or one of its worktrees — or -1.
  slotOf(directory: string): number;
  projectPath(slot: number): string | undefined;
  // The project's open terminals, ascending, main first.
  openPanes(slot: number): readonly number[];
  agentIn(id: string): boolean;
  // What is running in the pane when something is (pane-reading.ts's paneIsBusy), or null.
  busyWith(id: string): string | null;
  directoryOf(id: string): string | undefined;
  shellCommand(): string;
  // A fresh worker: a shell in the project, at the end of the list. Answers with its number.
  openWorker(slot: number): number;
  startWorker(id: string, directory: string, args: string[], cardId: string | null): void;
  closeWorker(id: string): void;
  mark(id: string, state: WorkerState): void;
  // The worktree a card was shipped into, if it still has one, and whether an agent is at work in it.
  cardWorktree(projectPath: string, cardId: string): { worktreePath: string; working: boolean } | undefined;
  makeWorktree(projectPath: string, title: string): Promise<string>;
  unfinished(worktreePath: string): Promise<string | null>;
  removeWorktree(worktreePath: string, projectPath: string): Promise<void>;
};

// Which open project a folder belongs to: its checkout, or anywhere in the folder its worktrees go,
// which holds both a card's and a throwaway one — the same test the token figures count a session by.
// -1 for a folder outside every one of them. Compared in real paths: the command's folder is its
// process.cwd(), which has symlinks resolved, and a project opened through one keeps the spelling it
// was opened by.
export function projectOfFolder(
  projectPaths: readonly (string | undefined)[], directory: string, realPath: (path: string) => string,
): number {
  const real = realPath(directory);
  return projectPaths.findIndex((projectPath) => (
    projectPath !== undefined && ranInProject(real, realPath(projectPath), realPath(worktreesRoot(projectPath)))
  ));
}

const answered = (output: string): SessionReply => ({ ok: true, output });
const refused = (output: string): SessionReply => ({ ok: false, output });

export function sessionRequests(ports: SessionPorts): (request: SessionRequest) => Promise<SessionReply> {
  // What each worker's hooks last said, until it is run again or released. Cleared rather than kept,
  // because a worker run a second time has not finished the second task.
  const states = new Map<string, WorkerState>();
  // The throwaway worktree each worker was given, which release removes once its work is out.
  const throwaways = new Map<string, string>();
  // The workers this session started. Any other pane with something running in it is somebody else's —
  // a dev server, a card a ship gave an agent — and release would kill it.
  const started = new Set<string>();

  // A worker of the asking project that is open, or why it is not one. Main and the editor are never a
  // worker: one is where the asking happens, the other holds nvim.
  function worker(id: string, slot: number): string | null {
    const { slot: paneSlot, index } = paneFromId(id);
    if (paneSlot !== slot) return `${id} is not a pane of this project`;
    if (!ports.openPanes(slot).includes(index)) return `${id} is not open — claim prints one that is`;
    if (index === MAIN_INDEX) return `${id} is the main session, which is never a worker`;
    return null;
  }

  function stateOf(id: string): string {
    if (paneFromId(id).index === MAIN_INDEX) return 'main';
    if (!ports.agentIn(id)) {
      const program = ports.busyWith(id);
      return program === null ? 'idle' : `busy ${program}`;
    }
    return states.get(id) ?? 'running';
  }

  async function run(id: string, slot: number, projectPath: string, prompt: string, card: string | null, worktree: boolean): Promise<SessionReply> {
    const refusal = worker(id, slot);
    if (refusal !== null) return refused(refusal);
    if (ports.agentIn(id)) return refused(`${id} already has a worker running — release it or claim another`);
    const program = ports.busyWith(id);
    if (program !== null) return refused(`${id} is running ${program} — claim another`);
    // One throwaway per pane, or release would forget the first.
    const held = throwaways.get(id);
    if (worktree && held !== undefined) return refused(`${id} still holds ${held} — release it first`);
    let directory = projectPath;
    if (card !== null) {
      const found = ports.cardWorktree(projectPath, card);
      if (found === undefined) return refused(`card ${card} has no worktree — moving it to Ship makes one`);
      // Two agents in one checkout write over each other's work.
      if (found.working) return refused(`card ${card} already has an agent at work in ${found.worktreePath}`);
      directory = found.worktreePath;
    } else if (worktree) {
      directory = await ports.makeWorktree(projectPath, prompt);
      throwaways.set(id, directory);
    }
    const { index } = paneFromId(id);
    states.delete(id);
    started.add(id);
    ports.startWorker(id, directory, workerArguments(ports.shellCommand(), projectPath, id, index, prompt), card);
    return answered(`started ${workerSessionName(projectPath, index)} in ${id}, in ${directory}`);
  }

  async function release(id: string, slot: number, projectPath: string): Promise<SessionReply> {
    const refusal = worker(id, slot);
    if (refusal !== null) return refused(refusal);
    const program = ports.busyWith(id);
    if (program !== null && !started.has(id)) return refused(`${id} is running ${program}, which no session run started — close it by hand`);
    ports.closeWorker(id);
    states.delete(id);
    started.delete(id);
    const throwaway = throwaways.get(id);
    throwaways.delete(id);
    if (throwaway === undefined) return answered(`released ${id}`);
    const reason = await ports.unfinished(throwaway);
    if (reason !== null) return answered(`released ${id}; kept ${throwaway}: ${reason}`);
    await ports.removeWorktree(throwaway, projectPath);
    return answered(`released ${id} and removed ${baseName(throwaway)}`);
  }

  function list(slot: number): SessionReply {
    return answered(ports.openPanes(slot).map((index) => {
      const id = terminalId(slot, index);
      return `${id}\t${paneLabel(index)}\t${stateOf(id)}\t${ports.directoryOf(id) ?? ''}`;
    }).join('\n'));
  }

  return async (request) => {
    const parsed = parseSessionCommand(request.args);
    if (!parsed.ok) return refused(parsed.message);
    const { command } = parsed;
    // The hooks report from wherever their worker stands, so a pane id is all a notify needs.
    if (command.kind === 'notify') {
      const { slot, index } = paneFromId(command.id);
      if (!ports.openPanes(slot).includes(index)) return refused(`${command.id} is not open`);
      if (command.state === 'running') states.delete(command.id);
      else states.set(command.id, command.state);
      ports.mark(command.id, command.state);
      return answered('');
    }
    const slot = ports.slotOf(request.directory);
    const projectPath = ports.projectPath(slot);
    if (slot === -1 || projectPath === undefined) return refused(`${request.directory} is not in a project open in Dashboard`);
    try {
      switch (command.kind) {
        case 'claim': return answered(terminalId(slot, ports.openWorker(slot)));
        case 'list': return list(slot);
        case 'run': return await run(command.id, slot, projectPath, command.prompt, command.card, command.worktree);
        case 'release': return await release(command.id, slot, projectPath);
      }
    } catch (error: unknown) {
      return refused(`session ${command.kind} failed: ${failureText(error)}`);
    }
  };
}
