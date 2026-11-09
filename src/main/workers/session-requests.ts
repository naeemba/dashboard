import { workerSessionName } from './dispatch';
import { failureText } from '../../shared/errors/failure';
import { worktreesRoot } from '../ship/ship';
import { ranInProject } from '../../shared/usage/usage';
import type { ProjectNamed } from '../projects/project-named';
import { answered, namesItsTarget, parseSessionCommand, refused, type SessionCommand, type SessionReply, type SessionRequest } from './session-cli';
import { MAIN_INDEX, paneFromId, paneLabel, terminalId } from '../../shared/panes/terminals';
import type { Refused, WorkerState } from '../../shared/app/bridge';
import { waitingText, workerAbout, workerStatus, isPaused, type DispatchedWorker, type StopWaiting } from '../../shared/workers/worker-roster';
import { paneLink } from '../../shared/workers/pane-link';
import { closedReport, doneReport, PAUSE_CEILING_MS } from '../../shared/workers/done-report';
import { stopNotices } from './stop-notices';
import type { PaneKind } from './pane-kind';
import { bind, isRefused, sessionReply } from '../actions/action';
import { paneClaim } from '../actions/pane/claim';
import { paneRelease } from '../actions/pane/release';
import { releaseVerdict, type WorkerLook } from './auto-release';

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
  // project.open's, for a claim's --project: its slot, or why not.
  openProject(path: string, name: string): Promise<number | Refused>;
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
  // pane.send: the text as a screen's prompt, or typed into the pane's shell with Enter after it. Sent
  // by the main of `dispatcherPath`; `handed` when the pane's agent became its worker.
  send(id: string, text: string, dispatcherPath: string): Promise<{ output: string; handed: boolean } | Refused>;
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
  // What closeFinished asks of a worker beside what is held here (auto-release.ts): whether its page
  // puts the keyboard back on it, and the column its card is in when that is Done or Cancelled, asked
  // only once nothing else has kept the pane open.
  hasKeyboard(id: string): boolean;
  finishedCard(id: string): string | null;
  // The grace period after a report read, from the settings; 0 closes a worker only for its card.
  closeAfterMs(): number;
  // A worker closed by closeFinished, why, and what pane.release answered: logged and shown.
  released(id: string, reason: string, output: string): void;
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
  // The main session in `slot` began a turn, or ended one after its result was read: a worker's stop
  // notice due in between waits for the end, so the report that turn read drops it.
  mainTurn(slot: number, midTurn: boolean): void;
  // What a worker's hooks report, from a `session notify` or a Claude screen's own hooks.
  notify(id: string, state: WorkerState, waiting?: StopWaiting): SessionReply;
  // Every finished worker pane released, each for the reason auto-release.ts gives. Run on a timer.
  closeFinished(): Promise<void>;
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
  // For each worker, since when it has been quiet — the last of work handed to it, a report from it
  // read, its turn ending — and whether a report was read since work was last handed to it: what
  // closeFinished's grace period runs on. Gone with the pane's worker.
  const quiet = new Map<string, { since: number; reportRead: boolean }>();
  const quietFrom = (id: string, reportRead: boolean) => quiet.set(id, { since: Date.now(), reportRead });
  // Only main's worker: one it ran or sent work, or a card's agent; a Claude opened by hand and never
  // sent work reports to nobody. The main that claimed it hears, which is another project's when
  // it was claimed with --project. Asked again when the wait ends, since the pane may have been given
  // to something else by then.
  const mainOf = (id: string): number => dispatched.get(id)?.dispatcher ?? paneFromId(id).slot;
  // The mains mid-turn now, by slot, with when the turn began. One mid-turn past PAUSE_CEILING_MS
  // counts as idle: `idle` waits on main's background work too, which may never end.
  const busyMains = new Map<number, number>();
  const midTurn = (slot: number) => Date.now() - (busyMains.get(slot) ?? -Infinity) < PAUSE_CEILING_MS;
  const notices = stopNotices({
    midTurn: (id) => midTurn(mainOf(id)),
    notice(id, paused) {
      if (!mainsWorker(id)) return;
      const slot = mainOf(id);
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
      quiet.delete(id);
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
    quietFrom(id, false);
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
      quiet.delete(id);
      const throwaway = throwaways.get(id);
      throwaways.delete(id);
      return throwaway;
    },
  });

  // Text main sends an agent is work handed to it (pane.send): listed as main's worker if no run made
  // it one, and at work from now, as its prompt hook will say, so nothing closes it on its last stop.
  async function send(id: string, slot: number, dispatcherPath: string, text: string): Promise<{ output: string } | Refused> {
    const sent = await ports.send(id, text, dispatcherPath);
    if (isRefused(sent) || !sent.handed) return sent;
    if (!dispatched.has(id)) dispatched.set(id, { dispatcher: slot, about: workerAbout(text) });
    quietFrom(id, false);
    notify(id, 'running');
    return sent;
  }

  // Every open pane of every open page, main's included.
  const openPaneIds = (): string[] => ports.openSlots()
    .flatMap(({ slot }) => ports.openPanes(slot).map((index) => terminalId(slot, index)));

  // What auto-release.ts decides a worker's close on.
  function look(id: string): WorkerLook {
    const said = states.get(id);
    const { since = 0, reportRead = false } = quiet.get(id) ?? {};
    return {
      handedToMain: mainsWorker(id),
      hasKeyboard: ports.hasKeyboard(id),
      state: said?.state ?? 'running',
      paused: isPaused(said?.waiting),
      finishedCard: () => ports.finishedCard(id),
      reportRead,
      quietMs: Date.now() - since,
    };
  }

  // One at a time, so two releases never race over one throwaway worktree. A refusal leaves the pane
  // as it is, and the next sweep decides again. Release takes back the worker's stop notice, so a
  // worker closed for its card before main read a report from it is told to main here instead. Not
  // while its main is mid-turn: the turn may have read the report, heard only at its end, and a close
  // told meanwhile is taken the moment it ends (workers-decision-1).
  async function closeFinished(): Promise<void> {
    const closeAfterMs = ports.closeAfterMs();
    for (const id of openPaneIds().filter(mainsWorker)) {
      if (midTurn(mainOf(id))) continue;
      const seen = look(id);
      const verdict = releaseVerdict(seen, closeAfterMs);
      if (!verdict.release) continue;
      const slot = mainOf(id);
      const name = nameOfPane(id);
      const released = await release.call({ id });
      if (isRefused(released)) continue;
      ports.released(id, verdict.reason, released.output);
      if (!seen.reportRead) ports.tell(slot, closedReport(name, id, verdict.reason));
    }
  }

  // Send and release are refused a pane the asker may not touch before the action is asked.
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
    if (state === 'done') quietFrom(id, quiet.get(id)?.reportRead ?? false);
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
        case 'send': return await onWorker(command.id, slot, () => send(command.id, slot, projectPath ?? '', command.text));
        case 'run': return await run(command.id, slot, projectPath ?? '', command.prompt, command.card, command.worktree, command.as);
        case 'release': return await onWorker(command.id, slot, () => release.call({ id: command.id }));
      }
    } catch (error: unknown) {
      return refused(`session ${command.kind} failed: ${failureText(error)}`);
    }
  }, {
    workers,
    notify,
    closeFinished,
    forget: (id: string) => { dispatched.delete(id); quiet.delete(id); notices.forget(id); },
    // Every open pane, not only `dispatched`: a worker resumed at launch was never dispatched.
    // Only a pane whose notice would go to the main that read it, by the rule `notice` uses: two
    // projects in folders of one name give their workers one name.
    heard(reader: number, sender: string) {
      const id = openPaneIds()
        .find((each) => nameOfPane(each) === sender && mainsWorker(each)
          && mainOf(each) === reader);
      if (id === undefined) return;
      notices.reported(id);
      quietFrom(id, true);
    },
    mainTurn(slot: number, midTurn: boolean) {
      if (midTurn) return void busyMains.set(slot, busyMains.get(slot) ?? Date.now());
      busyMains.delete(slot);
      notices.turnOver();
    },
  });
}
