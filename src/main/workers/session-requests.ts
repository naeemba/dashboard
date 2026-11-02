import { baseName } from '../../shared/app/base-name';
import { workerArguments, workerSessionName } from './dispatch';
import { failureText } from '../../shared/errors/failure';
import { worktreesRoot } from '../ship/ship';
import { ranInProject } from '../../shared/usage/usage';
import type { ProjectNamed } from '../projects/project-named';
import { parseSessionCommand, type SessionReply, type SessionRequest } from './session-cli';
import { MAIN_INDEX, paneFromId, paneLabel, terminalId } from '../../shared/panes/terminals';
import type { WorkerState } from '../../shared/app/bridge';
import { workerAbout, workerStatus, type DispatchedWorker } from '../../shared/workers/worker-roster';
import { paneLink } from '../../shared/workers/pane-link';

// What main does with a `session` command: every decision, against what main.ts hands over. Nothing
// here holds a pty or runs git; it asks for those through the ports, so the rules can be tested with a
// fake project behind them.

export type SessionPorts = {
  // The open project a folder is in — its checkout or one of its worktrees — or -1.
  slotOf(directory: string): number;
  projectPath(slot: number): string | undefined;
  // Every open project's slot and name, the manager's included, in page order.
  openSlots(): readonly { slot: number; name: string }[];
  // The project ~/.dashboard/projects.yaml gives that name or aka (project-named.ts's projectNamed).
  findProject(word: string): ProjectNamed;
  folderExists(path: string): boolean;
  // Opens the project at the path unless it is open already, and answers with its slot either way.
  openProject(path: string): number;
  // The project's open terminals, ascending, main first.
  openPanes(slot: number): readonly number[];
  agentIn(id: string): boolean;
  // What is running in the pane when something is (pane-reading.ts's paneIsBusy), or null.
  busyWith(id: string): string | null;
  directoryOf(id: string): string | undefined;
  // Whether main's worker is in the pane now: one a session run started, or one resumed at launch
  // because the pane held one when the app quit. Main clears it the moment that stops being true — the
  // agent exits, something else is started in the pane, or the pane closes — so release never kills
  // what somebody else put there afterwards.
  mainsWorkerIn(id: string): boolean;
  shellCommand(): string;
  // A fresh worker: a shell in the project, at the end of the list. Answers with its number.
  openWorker(slot: number): number;
  // The id the worker's conversation starts with, recorded in the app's session index first.
  newSession(projectPath: string, directory: string, cardId: string | null): string;
  startWorker(id: string, directory: string, agentArguments: string[], cardId: string | null): void;
  closeWorker(id: string): void;
  mark(id: string, state: WorkerState): void;
  // A message into that project's main session, queued behind whatever it is doing (chat-decision-7).
  tell(slot: number, text: string): void;
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

// What main is told when a worker it dispatched ends its turn: which worker, and that the worker's own
// report, if it wrote one, says what it did. The hook knows nothing of what the worker did.
export function doneReport(name: string, id: string): string {
  return `${name} in pane ${id} (${paneLink(id)}) has finished its turn. If it sent you a report, that says what it did;`
    + ' `pane list` shows where every worker stands.';
}

export const answered = (output: string): SessionReply => ({ ok: true, output });
export const refused = (output: string): SessionReply => ({ ok: false, output });

export type SessionAnswers = ((request: SessionRequest) => Promise<SessionReply>) & {
  // Every worker a session run started that is still open, in the order they ran, each naming the slot
  // whose main ran it: one read serves every page's status line and popup.
  workers(): DispatchedWorker[];
  // The pane stopped being that worker's for good: it closed, or something else started in it. Pane
  // numbers are reused, so without this the next pane at the number is listed as main's worker. Not
  // called when only the agent exits: that worker stays listed, idle, until it is released.
  forget(id: string): void;
};

export function sessionRequests(ports: SessionPorts): SessionAnswers {
  // What each worker's hooks last said, until it is run again or released. Cleared rather than kept,
  // because a worker run a second time has not finished the second task.
  const states = new Map<string, WorkerState>();
  // The throwaway worktree each worker was given, which release removes once its work is out.
  const throwaways = new Map<string, { worktreePath: string; projectPath: string }>();
  // Whether what is running in a busy pane is main's worker, so release may kill it. Anything else
  // running there is somebody else's — a dev server, a card a ship gave an agent — and release would
  // kill it. Main's worker always runs as the pane's agent, so a pane that is not running one is not it.
  const mainsWorker = (id: string): boolean => ports.agentIn(id) && ports.mainsWorkerIn(id);
  // The slot that claimed each pane opened with --project on another project's page. That slot may run
  // and release it as its own, and its main hears the worker's report. Slots are never reused, so an
  // entry left by a project closed since names nobody.
  const dispatchers = new Map<string, number>();
  // Each worker a session run started, until it is released, its number claimed again, or main forgets
  // it (its pane closed or given to something else): the slot whose
  // main ran it, which hears its report, and what it was asked. Kept apart from `dispatchers`, which is
  // who may run the pane, not who did.
  const dispatched = new Map<string, { dispatcher: number; about: string }>();

  // A worker the asking project may run or release, open, or why it is not one: one of its own panes,
  // or one it claimed elsewhere. Main and the editor are never a worker: one is where the asking
  // happens, the other holds nvim.
  function worker(id: string, slot: number): string | null {
    const { slot: paneSlot, index } = paneFromId(id);
    if (paneSlot !== slot && dispatchers.get(id) !== slot) return `${id} is not a pane of this project`;
    if (!ports.openPanes(paneSlot).includes(index)) return `${id} is not open — claim prints one that is`;
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

  // A pane on the asker's own page, or with --project on the page of the project projects.yaml names,
  // which is opened first if it is closed. Every claim settles who claimed the id, so a pane number
  // claimed again never keeps the rights of whoever claimed it before. Only a claim or a release
  // settles it: a claimed pane closed by hand and reopened by the new-terminal key stays the
  // claimer's, as a project's own panes already are its main's.
  function claim(slot: number, word: string | null): SessionReply {
    let target = slot;
    if (word !== null) {
      const found = ports.findProject(word);
      if (!found.ok) return refused(found.message);
      if (!ports.folderExists(found.path)) return refused(`${found.name} is at ${found.path}, which is not a folder`);
      target = ports.openProject(found.path);
    }
    const id = terminalId(target, ports.openWorker(target));
    dispatched.delete(id);
    if (target === slot) dispatchers.delete(id);
    else dispatchers.set(id, slot);
    return answered(id);
  }

  // The pane's own project, which is where its worker works and whose cards and worktrees it takes.
  const paneProject = (id: string): string | undefined => ports.projectPath(paneFromId(id).slot);

  async function run(id: string, slot: number, dispatcherPath: string, prompt: string, card: string | null, worktree: boolean): Promise<SessionReply> {
    const refusal = worker(id, slot);
    if (refusal !== null) return refused(refusal);
    const projectPath = paneProject(id);
    if (projectPath === undefined) return refused(`${id} is not in a project open in Dashboard`);
    if (ports.agentIn(id)) return refused(`${id} already has a worker running — release it or claim another`);
    const program = ports.busyWith(id);
    if (program !== null) return refused(`${id} is running ${program} — claim another`);
    // One throwaway per pane, or release would forget the first.
    const held = throwaways.get(id);
    if (worktree && held !== undefined) return refused(`${id} still holds ${held.worktreePath} — release it first`);
    let directory = projectPath;
    if (card !== null) {
      const found = ports.cardWorktree(projectPath, card);
      if (found === undefined) return refused(`card ${card} has no worktree — moving it to Ship makes one`);
      // Two agents in one checkout write over each other's work.
      if (found.working) return refused(`card ${card} already has an agent at work in ${found.worktreePath}`);
      directory = found.worktreePath;
    } else if (worktree) {
      directory = await ports.makeWorktree(projectPath, prompt);
      throwaways.set(id, { worktreePath: directory, projectPath });
    }
    const { index } = paneFromId(id);
    states.delete(id);
    const session = ports.newSession(projectPath, directory, card);
    ports.startWorker(id, directory, workerArguments(ports.shellCommand(), projectPath, id, index, prompt, dispatcherPath, session), card);
    dispatched.set(id, { dispatcher: slot, about: workerAbout(prompt) });
    // As its hooks would say it, so a status line counting the asker's workers counts this one now.
    ports.mark(id, 'running');
    return answered(`started ${workerSessionName(projectPath, index)} in ${id}, in ${directory} ${paneLink(id)}`);
  }

  async function release(id: string, slot: number): Promise<SessionReply> {
    const refusal = worker(id, slot);
    if (refusal !== null) return refused(refusal);
    const program = ports.busyWith(id);
    if (program !== null && !mainsWorker(id)) return refused(`${id} is running ${program}, which no session run started — close it by hand`);
    ports.closeWorker(id);
    states.delete(id);
    dispatchers.delete(id);
    dispatched.delete(id);
    const throwaway = throwaways.get(id);
    throwaways.delete(id);
    if (throwaway === undefined) return answered(`released ${id}`);
    const reason = await ports.unfinished(throwaway.worktreePath);
    if (reason !== null) return answered(`released ${id}; kept ${throwaway.worktreePath}: ${reason}`);
    await ports.removeWorktree(throwaway.worktreePath, throwaway.projectPath);
    return answered(`released ${id} and removed ${baseName(throwaway.worktreePath)}`);
  }

  function paneLines(slot: number, prefix: string): string[] {
    return ports.openPanes(slot).map((index) => {
      const id = terminalId(slot, index);
      return `${prefix}${id}\t${paneLabel(index)}\t${stateOf(id)}\t${ports.directoryOf(id) ?? ''}`;
    });
  }

  // --all puts the project's name first on each line, so the lines of two projects tell apart.
  function list(slot: number, all: boolean): SessionReply {
    if (!all) return answered(paneLines(slot, '').join('\n'));
    return answered(ports.openSlots().flatMap((each) => paneLines(each.slot, `${each.name}\t`)).join('\n'));
  }

  function workers(): DispatchedWorker[] {
    if (dispatched.size === 0) return [];
    const slots = new Map(ports.openSlots().map((each) => [each.slot, { name: each.name, open: ports.openPanes(each.slot) }]));
    return [...dispatched].flatMap(([id, { dispatcher, about }]) => {
      const { slot, index } = paneFromId(id);
      const page = slots.get(slot);
      if (page === undefined || !page.open.includes(index)) return [];
      return [{
        id, dispatcher, project: page.name, name: workerSessionName(ports.projectPath(slot) ?? '', index),
        about, status: workerStatus(mainsWorker(id), states.get(id)),
      }];
    });
  }

  return Object.assign(async (request: SessionRequest): Promise<SessionReply> => {
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
      // Only a worker main started: a card's agent a ship started reports through the board, and a
      // Claude opened by hand reports to nobody. The main that claimed it hears, which is another
      // project's when it was claimed with --project.
      if (command.state === 'done' && mainsWorker(command.id)) {
        ports.tell(dispatched.get(command.id)?.dispatcher ?? slot, doneReport(workerSessionName(ports.projectPath(slot) ?? '', index), command.id));
      }
      return answered('');
    }
    const slot = ports.slotOf(request.directory);
    const projectPath = ports.projectPath(slot);
    if (slot === -1 || projectPath === undefined) return refused(`${request.directory} is not in a project open in Dashboard`);
    try {
      switch (command.kind) {
        case 'claim': return claim(slot, command.project);
        case 'list': return list(slot, command.all);
        case 'run': return await run(command.id, slot, projectPath, command.prompt, command.card, command.worktree);
        case 'release': return await release(command.id, slot);
      }
    } catch (error: unknown) {
      return refused(`session ${command.kind} failed: ${failureText(error)}`);
    }
  }, { workers, forget: (id: string) => { dispatched.delete(id); } });
}
