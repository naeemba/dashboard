import { workerSessionName } from './dispatch';
import { failureText } from '../../shared/errors/failure';
import path from 'node:path';
import { isInside } from '../panes/shell-directory';
import { worktreesRoot } from '../ship/ship';
import { ranInProject } from '../../shared/usage/usage';
import type { ProjectNamed } from '../projects/project-named';
import { answered, namesItsTarget, parseSessionCommand, refused, type HookTold, type SessionCommand, type SessionReply, type SessionRequest } from './session-cli';
import { MAIN_INDEX, paneFromId, paneLabel, terminalId } from '../../shared/panes/terminals';
import type { Refused, WorkerState } from '../../shared/app/bridge';
import { waitingText, workerAbout, workerStatus, isPaused, type DispatchedWorker, type StopWaiting } from '../../shared/workers/worker-roster';
import { paneLink } from '../../shared/workers/pane-link';
import { doneReport, LAST_MESSAGE_KEPT, oneLineTail, PAUSE_CEILING_MS, tail } from '../../shared/workers/done-report';
import { stopNotices } from './stop-notices';
import { promptSources } from './prompt-source';
import type { PaneKind } from '../../shared/panes/pane-kind';
import { bind, isRefused, sessionReply } from '../actions/action';
import { paneClaim } from '../actions/pane/claim';
import { paneRelease } from '../actions/pane/release';
import { releaseVerdict, type WorkerLook } from './auto-release';
import { worktreeWithin } from './run-folder';
import { letGoAndSay, type Throwaway } from '../actions/worktree/throwaway';
import { statusText, type PaneStatus } from './status-lines';
import type { OpenPullRequest } from '../board/merge-request';

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
  // The path of the page whose main dispatched the worker in the pane now, or undefined when it holds
  // none of main's: one a session run started, or one resumed at launch because the pane held one when
  // the app quit, its dispatcher read back from session.json. Main clears it the moment that stops
  // being true — the agent exits, something else is started in the pane, or the pane closes — so
  // release never kills what somebody else put there afterwards.
  dispatcherOf(id: string): string | undefined;
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
  // Marks the worktree a throwaway on disk, for the launch's sweep to find (throwaway-marker.ts).
  markThrowaway(worktreePath: string): Promise<void>;
  // Why `run --in` may not start a worker in the folder, or the worktree of the repository it is in,
  // undefined for a folder of the project's own checkout (run-folder.ts).
  checkRunFolder(projectPath: string, folder: string): Promise<{ worktree: string | undefined } | Refused>;
  // Whether the folder is a linked worktree's top, from its `.git` file (run-folder.ts).
  holdsWorktree(folder: string): boolean;
  // Whether a throwaway's folder is still there (pane.release).
  exists(worktreePath: string): boolean;
  prune(projectPath: string): Promise<void>;
  unfinished(worktreePath: string): Promise<string | null>;
  // Whether the branch a worktree is on has a merged pull request (pane finish).
  merged(worktreePath: string): Promise<boolean>;
  // The branch a worktree is on, which `pane landed --branch` finds its worker by.
  branch(worktreePath: string): Promise<string>;
  removeWorktree(worktreePath: string, projectPath: string): Promise<void>;
  // What `pane landed` asks of a worker beside what is held here (auto-release.ts): whether its page
  // puts the keyboard back on it. And the column its card is in when that is Done or Cancelled, which
  // `pane finish` releases on and `pane list` marks.
  hasKeyboard(id: string): boolean;
  finishedCard(id: string): string | null;
  // `pane status`: the card whose worktree record names the pane, with the column it is in, and the
  // project's open pull requests, which throws when the forge cannot answer.
  paneCard(id: string): PaneStatus['card'];
  openPullRequests(projectPath: string): Promise<readonly OpenPullRequest[]>;
  // A worker closed by `pane landed`, why, and what pane.release answered: logged and shown.
  released(id: string, reason: string, output: string): void;
  // What became of the throwaway of a pane that went without a release: logged under its project.
  threwAway(id: string, said: string, projectPath: string): void;
  // Where a path really is (real-path.ts): git lists a throwaway by it, a pane's folder keeps the
  // spelling its project was opened by.
  realPath(path: string): string;
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
  // Every worker a session run started that is still open, in the order they ran, then every other open
  // pane holding main's worker (back after a restart, a card shipped from the board, a Claude handed work
  // with pane send), each naming the slot whose main it reports to: one read serves every page's status
  // line and popup.
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
  mainTurn(slot: number, running: boolean): void;
  // What a worker's hooks report, from a `session notify` or a Claude screen's own hooks.
  notify(id: string, state: WorkerState, waiting?: StopWaiting, told?: HookTold): SessionReply;
  // The pane is gone, closed by hand or with its project rather than released: its throwaway is let
  // go of as release would (throwaway.ts).
  dropped(id: string): Promise<void>;
  // The open pane standing in a throwaway found on disk at launch, which holds it from now on, or
  // undefined (worktree.sweep).
  hold(throwaway: Throwaway): string | undefined;
};

export function sessionRequests(ports: SessionPorts): SessionAnswers {
  // What each worker's hooks last said, until it is run again or released. Cleared rather than kept,
  // because a worker run a second time has not finished the second task, with what a done's Stop hook
  // said the session still waits on.
  const states = new Map<string, { state: WorkerState; waiting?: StopWaiting }>();
  // The throwaway worktree each pane was given, let go of whenever the pane goes (throwaway.ts).
  const throwaways = new Map<string, Throwaway>();
  // The panes a release is closing, whose throwaway the release lets go of, not `dropped`.
  const releasing = new Set<string>();
  // Whether what is running in a busy pane is main's worker, so release may kill it. Anything else
  // running there is somebody else's — a dev server, a card a ship gave an agent — and release would
  // kill it. Main's worker always runs as the pane's agent, so a pane that is not running one is not it.
  const mainsWorker = (id: string): boolean => ports.agentIn(id) && ports.dispatcherOf(id) !== undefined;
  // The slot that claimed each pane opened with --project on another project's page. That slot may run
  // and release it as its own, and its main hears the worker's report. Slots are never reused, so an
  // entry left by a project closed since names nobody.
  const dispatchers = new Map<string, number>();
  // Each worker a session run started, until it is released, its number claimed again, or main forgets
  // it (its pane closed or given to something else): the slot whose main ran it, which hears its
  // report, and what it was asked. Kept apart from `dispatchers`, which is who may run the pane, not
  // who did.
  const dispatched = new Map<string, { dispatcher: number; about: string }>();
  // The workers main read a report from since it last handed them work: a pause of theirs is not news.
  const reportsRead = new Set<string>();
  // The workers `pane landed` kept with their work in, until they are handed work again or let go of.
  const keptWithWorkIn = new Set<string>();
  const handedWork = (id: string) => { reportsRead.delete(id); keptWithWorkIn.delete(id); };
  // Its card is Done or Cancelled, or `pane landed` kept it after its branch merged: `pane finish` is
  // all that is left for it.
  const workIn = (id: string) => keptWithWorkIn.has(id) || ports.finishedCard(id) !== null;
  // Only main's worker: one it ran or sent work, or a card's agent; a Claude opened by hand and never
  // sent work reports to nobody. The main that claimed it hears, which is another project's when
  // it was claimed with --project. `dispatched` is gone after a restart, so a resumed worker's main is
  // the page its saved dispatcher names, and its own page's only when that page is not open. Asked
  // again when the wait ends, since the pane may have been given to something else by then.
  function mainOf(id: string): number {
    const ran = dispatched.get(id);
    if (ran !== undefined) return ran.dispatcher;
    const dispatcherPath = ports.dispatcherOf(id);
    const slot = dispatcherPath === undefined ? -1 : ports.slotOf(dispatcherPath);
    return slot === -1 ? paneFromId(id).slot : slot;
  }
  // The mains mid-turn now, by slot, each with whether the turn has run PAUSE_CEILING_MS and the
  // timer that says so. One past it counts as idle, and every notice held for it is told then:
  // `idle` waits on main's background work too, which may never end. One clock for the turn, so a
  // notice is held no longer than the turn's ceiling, whenever it came due.
  const busyMains = new Map<number, { overCeiling: boolean; stop: () => void }>();
  const midTurn = (slot: number) => busyMains.get(slot)?.overCeiling === false;
  // The last message each worker ended a turn with, its tail, for its notice and `pane report`. Kept
  // while it works again, so a report still says what it got to; gone with the worker.
  const lastMessages = new Map<string, string>();
  const prompts = promptSources();
  // Every time a worker is let go of: its stop, its last message and whose turn it was on.
  const forgetWorker = (id: string) => {
    notices.forget(id);
    lastMessages.delete(id);
    prompts.forget(id);
  };
  const notices = stopNotices({
    midTurn: (id) => midTurn(mainOf(id)),
    // Not for a turn you typed into the worker yourself (prompt-source.ts), nor a pause of one that
    // already reported or whose work is in: what it waits on is moot.
    notice(id, paused) {
      if (!mainsWorker(id) || prompts.fromUser(id)) return;
      if (paused && (reportsRead.has(id) || workIn(id))) return;
      const slot = mainOf(id);
      const messageId = ports.tell(slot, doneReport(nameOfPane(id), id, paused, lastMessages.get(id)));
      return () => ports.withdraw(slot, messageId);
    },
  });

  // A worker the asking project may run or release, open, or why it is not one: one of its own panes,
  // or one it claimed or dispatched elsewhere, the last kept across a restart. Main and the editor are
  // never a worker: one is where the asking happens, the other holds nvim.
  function worker(id: string, slot: number): string | null {
    const { slot: paneSlot, index } = paneFromId(id);
    if (paneSlot !== slot && dispatchers.get(id) !== slot && mainOf(id) !== slot) return `${id} is not a pane of this project`;
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
    if (said?.state === 'done' && mainsWorker(id) && workIn(id)) return `done, work in: pane finish ${id}`;
    return isPaused(said?.waiting) ? `paused, ${waitingText(said.waiting)}` : said?.state ?? 'running';
  }

  const claim = bind(paneClaim, {
    ...ports,
    claimedBy(id, slot) {
      dispatched.delete(id);
      handedWork(id);
      if (slot === null) dispatchers.delete(id);
      else dispatchers.set(id, slot);
    },
  });

  // The pane's own project, which is where its worker works and whose cards and worktrees it takes.
  const paneProject = (id: string): string | undefined => ports.projectPath(paneFromId(id).slot);
  // The session name of the worker in the pane, which its reports to main are signed with.
  const nameOfPane = (id: string): string => workerSessionName(paneProject(id) ?? '', paneFromId(id).index);

  async function run(id: string, slot: number, dispatcherPath: string, prompt: string, card: string | null, worktree: boolean, folder: string | null, as: PaneKind | null): Promise<SessionReply> {
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
    let unmarked = '';
    if (card !== null) {
      const found = ports.cardWorktree(projectPath, card);
      if (found === undefined) return refused(`card ${card} has no worktree — moving it to Ship makes one`);
      // Two agents in one checkout write over each other's work.
      if (found.working) return refused(`card ${card} already has an agent at work in ${found.worktreePath}`);
      const working = agentAtWorkIn(found.worktreePath, id);
      if (working !== undefined) return refused(`${working} already has an agent at work in ${found.worktreePath}`);
      directory = found.worktreePath;
    } else if (worktree) {
      directory = await ports.makeWorktree(projectPath, prompt);
      throwaways.set(id, { worktreePath: directory, projectPath });
      // Marked only once held here, so the sweep never takes one still being made for a pane. A mark
      // that fails costs only the sweep finding it after a restart, so the worker starts anyway.
      unmarked = await ports.markThrowaway(directory).then(
        () => '',
        (error: unknown) => ` (not marked a throwaway, so a restart will not sweep it: ${failureText(error)})`,
      );
    } else if (folder !== null) {
      // The caller's folder: never a throwaway, so release leaves it on disk.
      const checked = await ports.checkRunFolder(projectPath, folder);
      if (isRefused(checked)) return refused(checked.refused);
      const { worktree: folderWorktree } = checked;
      if (folderWorktree !== undefined) {
        // Two agents in one checkout write over each other's work, as with --card. The project's own
        // checkout is left out: main's agent stands there, and a plain run starts one beside it.
        const working = agentAtWorkIn(folderWorktree, id);
        if (working !== undefined) return refused(`${working} already has an agent at work in ${folderWorktree}`);
      }
      directory = folder;
    }
    const { index } = paneFromId(id);
    states.delete(id);
    forgetWorker(id);
    const started = await ports.startWorker(id, { directory, prompt, as, cardId: card, dispatcherPath });
    if (isRefused(started)) return refused(started.refused);
    dispatched.set(id, { dispatcher: slot, about: workerAbout(prompt) });
    handedWork(id);
    // As its hooks would say it, so a status line counting the asker's workers counts this one now.
    ports.mark(id, 'running');
    return answered(`started ${workerSessionName(projectPath, index)} in ${id}, in ${directory}${unmarked} ${paneLink(id)}`);
  }

  const release = bind(paneRelease, {
    ...ports,
    mainsWorker,
    // The pane drops as it closes, and a dropped throwaway is the release's to let go of and answer for.
    async close(id) {
      releasing.add(id);
      try {
        return await ports.close(id);
      } finally {
        releasing.delete(id);
      }
    },
    forget(id) {
      states.delete(id);
      forgetWorker(id);
      dispatchers.delete(id);
      dispatched.delete(id);
      handedWork(id);
      const throwaway = throwaways.get(id);
      throwaways.delete(id);
      return throwaway;
    },
  });

  // The worktree the pane works in, when it is not the project's own checkout: that one has no branch
  // of its own, and the merged pull requests of the branch it is on are anybody's.
  // A folder inside the checkout (`run --in packages/web`) is the checkout too, unless it is in a
  // worktree nested there (`.claude/worktrees/x`). A folder already gone is handed back as it is, since
  // its `.git` file went with it: a nested worktree removed after its merge is then taken by the merge in
  // branchMerged. So is a deleted folder of the checkout, whose worker has nowhere left to work.
  function ownWorktree(id: string): string | undefined {
    const directory = ports.directoryOf(id);
    const project = paneProject(id);
    if (directory === undefined || project === undefined || !isInside(directory, project)) return directory;
    if (!ports.exists(directory)) return directory;
    return worktreeWithin(directory, project, ports.holdsWorktree);
  }

  // Another pane whose agent is at work in the worktree, which two agents write over each other's work
  // in: standing in it, and not in a worktree nested below it.
  const agentAtWorkIn = (worktree: string, exceptId: string): string | undefined => openPaneIds().find((each) => {
    const there = ports.directoryOf(each);
    return each !== exceptId && ports.agentIn(each) && there !== undefined && isInside(there, worktree)
      && worktreeWithin(there, worktree, ports.holdsWorktree) === undefined;
  });

  // Whether the branch of the pane's own worktree merged, which is the card's too before the follow
  // moves it: what `pane finish` releases on beside the card. A worktree already gone was
  // taken by the merge (`gh pr merge --delete-branch`), and git cannot be asked in it: release says so.
  async function branchMerged(id: string): Promise<boolean> {
    const worktree = ownWorktree(id);
    return worktree !== undefined && (!ports.exists(worktree) || await ports.merged(worktree));
  }

  // Release once the work is in: the pane's card Done or Cancelled, or its branch merged.
  async function finish(id: string): Promise<{ output: string } | Refused> {
    if (ports.finishedCard(id) === null && !(await branchMerged(id))) {
      const worktree = ownWorktree(id);
      return { refused: `${id}'s work is not in: no card of its is Done or Cancelled${worktree === undefined ? '' : ` and ${worktree}'s branch has no merged pull request`}` };
    }
    return release.call({ id });
  }

  // Text main sends an agent is work handed to it (pane.send): listed as main's worker if no run made
  // it one, and at work from now, as its prompt hook will say, so nothing closes it on its last stop.
  async function send(id: string, slot: number, dispatcherPath: string, text: string): Promise<{ output: string } | Refused> {
    const sent = await ports.send(id, text, dispatcherPath);
    if (isRefused(sent) || !sent.handed) return sent;
    if (!dispatched.has(id)) dispatched.set(id, { dispatcher: slot, about: workerAbout(text) });
    handedWork(id);
    notify(id, 'running');
    return sent;
  }

  // Every open pane of every open page, main's included.
  const openPaneIds = (): string[] => ports.openSlots()
    .flatMap(({ slot }) => ports.openPanes(slot).map((index) => terminalId(slot, index)));

  // What auto-release.ts decides a worker's close on.
  const look = (id: string): WorkerLook => ({
    handedToMain: mainsWorker(id),
    hasKeyboard: ports.hasKeyboard(id),
    state: states.get(id)?.state ?? 'running',
    typedByUser: prompts.fromUser(id),
  });

  // Whether the pane's own worktree is the card's, or on the branch. A worktree already gone, or one
  // git cannot answer in, is on no branch to match.
  async function worksOn(id: string, projectPath: string, by: 'branch' | 'card', name: string): Promise<boolean> {
    const worktree = ownWorktree(id);
    if (by === 'card') return worktree !== undefined && worktree === ports.cardWorktree(projectPath, name)?.worktreePath;
    if (worktree === undefined || !ports.exists(worktree)) return false;
    return (await ports.branch(worktree).catch(() => '')).trim() === name;
  }

  // Main's own command put the work in: each of the asker's panes on that branch or card released, or
  // kept for what auto-release.ts says, a line each. One at a time, so two releases never race over one
  // throwaway worktree. Nothing on it answers nothing. The pane the command ran in is never one: its
  // own land or move is waiting on this answer.
  async function landed(slot: number, projectPath: string, by: 'branch' | 'card', name: string, from: string | null): Promise<SessionReply> {
    const lines: string[] = [];
    for (const id of openPaneIds()) {
      if (id === from || worker(id, slot) !== null || !(await worksOn(id, projectPath, by, name))) continue;
      const verdict = releaseVerdict(look(id));
      const released = verdict.release ? await release.call({ id }) : { refused: verdict.why };
      if (isRefused(released)) {
        keptWithWorkIn.add(id);
        lines.push(`kept ${id}: ${released.refused}`);
        continue;
      }
      ports.released(id, by === 'branch' ? `${name} merged` : 'card finished', released.output);
      lines.push(`released ${id}`);
    }
    return answered(lines.join('\n'));
  }

  // Send and release are refused a pane the asker may not touch before the action is asked.
  async function onWorker(id: string, slot: number, act: () => Promise<{ output: string } | Refused>): Promise<SessionReply> {
    const refusal = worker(id, slot);
    return refusal === null ? sessionReply(await act()) : refused(refusal);
  }

  // The id, label and state that lead both pane list's line and pane status's.
  function paneHead(id: string): string {
    return `${id}\t${paneLabel(paneFromId(id).index)}\t${stateOf(id)}`;
  }

  function paneLine(id: string, prefix = ''): string {
    return `${prefix}${paneHead(id)}\t${ports.directoryOf(id) ?? ''}`;
  }

  // With reports, a fifth column: the end of the worker's last message, empty for one that has said none.
  function paneLines(slot: number, prefix: string, reports: boolean): string[] {
    return ports.openPanes(slot).map((index) => {
      const id = terminalId(slot, index);
      return reports ? `${paneLine(id, prefix)}\t${oneLineTail(lastMessages.get(id) ?? '')}` : paneLine(id, prefix);
    });
  }

  // A worker's line from list and the last message it ended a turn with, so main learns what a worker
  // got to without reading its session log by hand.
  function report(id: string, slot: number): SessionReply {
    const refusal = worker(id, slot);
    if (refusal !== null) return refused(refusal);
    return answered(`${paneLine(id)}\n\n${lastMessages.get(id) ?? 'It has not ended a turn since it was started.'}`);
  }

  async function status(slot: number, projectPath: string): Promise<SessionReply> {
    const panes = ports.openPanes(slot).map((index): PaneStatus => {
      const id = terminalId(slot, index);
      return {
        head: paneHead(id),
        directory: ports.directoryOf(id) ?? '',
        card: ports.paneCard(id),
        report: oneLineTail(lastMessages.get(id) ?? ''),
      };
    });
    const pulls = await ports.openPullRequests(projectPath).catch((error: unknown) => failureText(error));
    return answered(statusText(panes, pulls));
  }

  // --all puts the project's name first on each line, so the lines of two projects tell apart.
  function list(slot: number, all: boolean, reports: boolean): SessionReply {
    if (!all) return answered(paneLines(slot, '', reports).join('\n'));
    return answered(ports.openSlots().flatMap((each) => paneLines(each.slot, `${each.name}\t`, reports)).join('\n'));
  }

  // A pane holding main's worker that no run started this launch (resumed after a restart, a shipped
  // card, a Claude handed work) follows the ones that were, under the main it reports to (mainOf), with
  // no prompt to say what it is about.
  function workers(): DispatchedWorker[] {
    const slots = new Map(ports.openSlots().map((each) => [each.slot, { name: each.name, open: ports.openPanes(each.slot) }]));
    const restored = [...slots].flatMap(([slot, { open }]) => open.map((index) => terminalId(slot, index)))
      .filter((id) => !dispatched.has(id) && mainsWorker(id))
      .map((id) => [id, { dispatcher: mainOf(id), about: '' }] as const);
    return [...dispatched, ...restored].flatMap(([id, { dispatcher, about }]) => {
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
  function notify(id: string, state: WorkerState, waiting?: StopWaiting, told: HookTold = {}): SessionReply {
    const { slot, index } = paneFromId(id);
    if (!ports.openPanes(slot).includes(index)) return refused(`${id} is not open`);
    if (told.lastMessage !== undefined) lastMessages.set(id, tail(told.lastMessage, LAST_MESSAGE_KEPT));
    if (state === 'running') {
      prompts.prompted(id, told.promptSource, told.handed === true);
      states.delete(id);
    } else states.set(id, { state, waiting });
    ports.mark(id, state);
    if (mainsWorker(id)) notices.state(id, state, waiting);
    return answered('');
  }

  return Object.assign(async (request: SessionRequest): Promise<SessionReply> => {
    const parsed = parseSessionCommand(request.args);
    if (!parsed.ok) return refused(parsed.message);
    const { command } = parsed;
    if (command.kind === 'notify') return notify(command.id, command.state, command.waiting, command.told);
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
        case 'list': return list(slot, command.all, command.reports);
        case 'send': return await onWorker(command.id, slot, () => send(command.id, slot, projectPath ?? '', command.text));
        case 'run': {
          // --in is typed relative to where the command ran, main's own folder most often.
          const folder = command.folder === null ? null : path.resolve(request.directory, command.folder);
          return await run(command.id, slot, projectPath ?? '', command.prompt, command.card, command.worktree, folder, command.as);
        }
        case 'release': return await onWorker(command.id, slot, () => release.call({ id: command.id }));
        case 'finish': return await onWorker(command.id, slot, () => finish(command.id));
        case 'report': return report(command.id, slot);
        case 'status': return await status(slot, projectPath ?? '');
        case 'landed': return await landed(slot, projectPath ?? '', command.by, command.name, command.from);
      }
    } catch (error: unknown) {
      return refused(`session ${command.kind} failed: ${failureText(error)}`);
    }
  }, {
    workers,
    notify,
    async dropped(id: string) {
      const throwaway = throwaways.get(id);
      if (throwaway === undefined || releasing.has(id)) return;
      throwaways.delete(id);
      ports.threwAway(id, await letGoAndSay(ports, throwaway), throwaway.projectPath);
    },
    hold(throwaway: Throwaway) {
      const real = ports.realPath(throwaway.worktreePath);
      const held = [...throwaways].find(([, each]) => ports.realPath(each.worktreePath) === real);
      if (held !== undefined) return held[0];
      const id = openPaneIds().find((each) => {
        const there = ports.directoryOf(each);
        return there !== undefined && isInside(ports.realPath(there), real);
      });
      if (id !== undefined && !throwaways.has(id)) throwaways.set(id, throwaway);
      return id;
    },
    forget: (id: string) => { dispatched.delete(id); handedWork(id); forgetWorker(id); },
    // Every open pane, not only `dispatched`: a worker resumed at launch was never dispatched.
    // Only a pane whose notice would go to the main that read it, by the rule `notice` uses: two
    // projects in folders of one name give their workers one name.
    heard(reader: number, sender: string) {
      const id = openPaneIds()
        .find((each) => nameOfPane(each) === sender && mainsWorker(each)
          && mainOf(each) === reader);
      if (id === undefined) return;
      notices.reported(id);
      reportsRead.add(id);
    },
    mainTurn(slot: number, running: boolean) {
      if (running) {
        if (busyMains.has(slot)) return;
        const turn = { overCeiling: false, stop: () => clearTimeout(timer) };
        const timer = setTimeout(() => { turn.overCeiling = true; notices.turnOver(); }, PAUSE_CEILING_MS);
        return void busyMains.set(slot, turn);
      }
      busyMains.get(slot)?.stop();
      busyMains.delete(slot);
      notices.turnOver();
    },
  });
}
