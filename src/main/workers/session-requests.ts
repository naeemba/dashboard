import { workerSessionName } from './dispatch';
import { failureText } from '../../shared/errors/failure';
import { worktreesRoot } from '../ship/ship';
import { ranInProject } from '../../shared/usage/usage';
import type { ProjectNamed } from '../projects/project-named';
import { namesItsTarget, parseSessionCommand, type SessionCommand, type SessionReply, type SessionRequest } from './session-cli';
import { MAIN_INDEX, paneFromId, paneLabel, terminalId } from '../../shared/panes/terminals';
import type { Refused, WorkerState } from '../../shared/app/bridge';
import { waitingText, workerAbout, workerStatus, isPaused, type DispatchedWorker, type StopWaiting } from '../../shared/workers/worker-roster';
import { paneLink } from '../../shared/workers/pane-link';
import { doneReport } from '../../shared/workers/done-report';
import { stopNotices } from './stop-notices';
import type { PaneKind } from './pane-kind';
import { bind, isRefused, sessionReply } from '../actions/action';
import { paneClaim } from '../actions/pane/claim';
import { paneRelease } from '../actions/pane/release';

// What main does with a `session` command: who is asking and what they may touch, against what main.ts
// hands over. Every change to a pane is a pane action (actions/pane/): claim and release are bound here,
// on the ledger of who claimed and ran what; open, close, send and dispatch come in bound by main.
// Nothing here holds a pty or runs git, so the rules can be tested with a fake project behind them.

// What a worker is started on. Whether it is a Claude screen or Claude Code in the pane's terminal,
// and what either is started with, is pane.dispatch's (actions/pane/dispatch.ts).
export type WorkerStart = { directory: string; prompt: string; as: PaneKind | null; cardId: string | null; dispatcherPath: string };

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
  // pane.open: a fresh worker, a shell in the project, at the lowest number going.
  open(slot: number): Promise<{ index: number } | Refused>;
  // pane.dispatch, for a card's or a throwaway's worker as main sets it up. `dispatcherPath` is the page
  // whose main the worker reports to, saved so a restart starts that main.
  startWorker(id: string, start: WorkerStart): Promise<{ output: string } | Refused>;
  // pane.close.
  close(id: string): Promise<{ output: string } | Refused>;
  // pane.send: the text as a screen's prompt, or typed into the pane's shell with Enter after it.
  send(id: string, text: string): Promise<{ output: string } | Refused>;
  mark(id: string, state: WorkerState): void;
  // A message into that project's main session, queued behind whatever it is doing (chat-decision-7).
  // Answers with the id `withdraw` takes it back by while it still waits in the queue.
  tell(slot: number, text: string): string;
  withdraw(slot: number, messageId: string): void;
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

// Who is asking: the open project the command's folder is in, or, from a folder outside every one —
// a plain terminal — the project of the pane the words name, since the id says which. A command
// naming no pane stays -1, and is refused unless its words name the target some other way.
function askingSlot(command: SessionCommand, folderSlot: number): number {
  if (folderSlot !== -1) return folderSlot;
  return 'id' in command ? paneFromId(command.id).slot : -1;
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
  // The main session in `slot` read a message from the session called `sender`: when that is a worker
  // that main dispatched, its next stop needs no notice.
  heard(slot: number, sender: string): void;
  // What a worker's hooks report, from a `session notify` or a Claude screen's own hooks.
  notify(id: string, state: WorkerState, waiting?: StopWaiting): SessionReply;
};

export function sessionRequests(ports: SessionPorts): SessionAnswers {
  // What each worker's hooks last said, until it is run again or released. Cleared rather than kept,
  // because a worker run a second time has not finished the second task, with what a done's Stop hook
  // said the session still waits on.
  const states = new Map<string, { state: WorkerState; waiting?: StopWaiting }>();
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
  // it (its pane closed or given to something else): the slot whose main ran it, which hears its
  // report, and what it was asked. Kept apart from `dispatchers`, which is who may run the pane, not
  // who did.
  const dispatched = new Map<string, { dispatcher: number; about: string }>();
  // Only a worker main started: a card's agent a ship started reports through the board, and a Claude
  // opened by hand reports to nobody. The main that claimed it hears, which is another project's when
  // it was claimed with --project. Asked again when the wait ends, since the pane may have been given
  // to something else by then.
  const notices = stopNotices({
    notice(id, paused) {
      if (!mainsWorker(id)) return;
      const slot = dispatched.get(id)?.dispatcher ?? paneFromId(id).slot;
      const messageId = ports.tell(slot, doneReport(nameOfPane(id), id, paused));
      return () => ports.withdraw(slot, messageId);
    },
  });

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
    const said = states.get(id);
    return isPaused(said?.waiting) ? `paused, ${waitingText(said.waiting)}` : said?.state ?? 'running';
  }

  const claim = bind(paneClaim, {
    ...ports,
    claimedBy(id, slot) {
      dispatched.delete(id);
      if (slot === null) dispatchers.delete(id);
      else dispatchers.set(id, slot);
    },
  });

  // The pane's own project, which is where its worker works and whose cards and worktrees it takes.
  const paneProject = (id: string): string | undefined => ports.projectPath(paneFromId(id).slot);
  // The session name of the worker in the pane, which its reports to main are signed with.
  const nameOfPane = (id: string): string => workerSessionName(paneProject(id) ?? '', paneFromId(id).index);

  async function run(id: string, slot: number, dispatcherPath: string, prompt: string, card: string | null, worktree: boolean, as: PaneKind | null): Promise<SessionReply> {
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
    notices.forget(id);
    const started = await ports.startWorker(id, { directory, prompt, as, cardId: card, dispatcherPath });
    if (isRefused(started)) return refused(started.refused);
    dispatched.set(id, { dispatcher: slot, about: workerAbout(prompt) });
    // As its hooks would say it, so a status line counting the asker's workers counts this one now.
    ports.mark(id, 'running');
    return answered(`started ${workerSessionName(projectPath, index)} in ${id}, in ${directory} ${paneLink(id)}`);
  }

  const release = bind(paneRelease, {
    ...ports,
    mainsWorker,
    forget(id) {
      states.delete(id);
      notices.forget(id);
      dispatchers.delete(id);
      dispatched.delete(id);
      const throwaway = throwaways.get(id);
      throwaways.delete(id);
      return throwaway;
    },
  });

  // Run, send and release are refused a pane the asker may not touch before the action is asked.
  async function onWorker(id: string, slot: number, act: () => Promise<{ output: string } | Refused>): Promise<SessionReply> {
    const refusal = worker(id, slot);
    return refusal === null ? sessionReply(await act()) : refused(refusal);
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
      const said = states.get(id);
      const waiting = said?.waiting;
      const status = workerStatus(mainsWorker(id), said?.state, isPaused(waiting));
      return [{
        id, dispatcher, project: page.name, name: nameOfPane(id),
        about, status, ...(status === 'paused' && isPaused(waiting) && { waiting: waitingText(waiting) }),
      }];
    });
  }

  // The hooks report from wherever their worker stands, so a pane id is all a notify needs.
  function notify(id: string, state: WorkerState, waiting?: StopWaiting): SessionReply {
    const { slot, index } = paneFromId(id);
    if (!ports.openPanes(slot).includes(index)) return refused(`${id} is not open`);
    if (state === 'running') states.delete(id);
    else states.set(id, { state, waiting });
    ports.mark(id, state);
    if (mainsWorker(id)) notices.state(id, state, waiting);
    return answered('');
  }

  return Object.assign(async (request: SessionRequest): Promise<SessionReply> => {
    const parsed = parseSessionCommand(request.args);
    if (!parsed.ok) return refused(parsed.message);
    const { command } = parsed;
    if (command.kind === 'notify') return notify(command.id, command.state, command.waiting);
    const folderSlot = ports.slotOf(request.directory);
    const slot = askingSlot(command, folderSlot);
    // From outside every project only words that name their target are answered: a claim --project
    // opens its worker in the named project, which is then its asker, and list --all lists every one.
    // There a pane id whose page is not open is the id's fault, not the folder's.
    const projectPath = ports.projectPath(slot);
    if (slot === -1 ? !namesItsTarget(command) : projectPath === undefined) {
      const blamed = folderSlot === -1 && 'id' in command ? command.id : request.directory;
      return refused(`${blamed} is not in a project open in Dashboard`);
    }
    try {
      switch (command.kind) {
        case 'claim': return sessionReply(await claim.call({ slot, project: command.project }));
        case 'list': return list(slot, command.all);
        case 'send': return await onWorker(command.id, slot, () => ports.send(command.id, command.text));
        case 'run': return await run(command.id, slot, projectPath ?? '', command.prompt, command.card, command.worktree, command.as);
        case 'release': return await onWorker(command.id, slot, () => release.call({ id: command.id }));
      }
    } catch (error: unknown) {
      return refused(`session ${command.kind} failed: ${failureText(error)}`);
    }
  }, {
    workers,
    notify,
    forget: (id: string) => { dispatched.delete(id); notices.forget(id); },
    // Every open pane, not only `dispatched`: a worker resumed at launch was never dispatched.
    // Only a pane whose notice would go to the main that read it, by the rule `notice` uses: two
    // projects in folders of one name give their workers one name.
    heard(reader: number, sender: string) {
      const id = ports.openSlots()
        .flatMap(({ slot }) => ports.openPanes(slot).map((index) => terminalId(slot, index)))
        .find((each) => nameOfPane(each) === sender && mainsWorker(each)
          && (dispatched.get(each)?.dispatcher ?? paneFromId(each).slot) === reader);
      if (id !== undefined) notices.reported(id);
    },
  });
}
