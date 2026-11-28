import type { Project, WorktreeEntry } from '../../shared/app/bridge';
import type { LogDraft } from '../../shared/app/log-entry';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { paneIsBusy, programIn, type PaneCommand } from '../../shared/panes/pane-reading';
import { paneFromId } from '../../shared/panes/terminals';
import type { CardActions } from '../actions/card/card-actions';
import type { browserActions } from '../actions/browser/browser-actions';
import type { PaneActions } from '../actions/pane/pane-actions';
import type { worktreeActions } from '../actions/worktree/worktree-actions';
import { runProgram } from '../app/git';
import { realPath } from '../app/real-path';
import type { BoardChanges } from '../board/board-changes';
import { openPullRequests } from '../board/merge-request';
import type { registerChatSessions } from '../chat/chat-sessions';
import { projectInSlot, sessionSlot } from '../manager/manager-terminals';
import type { SlotPanes } from '../panes/slot-panes';
import { projectNamedInFile } from '../projects/project-named';
import { entryForCard } from '../ship/worktree-store';
import type { worktreeKeeper } from '../ship/worktree-keeper';
import { finishedCardIn } from './auto-release';
import type { PoolPorts } from './pane-pool-ports';
import { checkRunFolder, holdsWorktree } from './run-folder';
import type { screenWorkers } from './screen-workers';
import { projectOfFolder, type SessionPorts } from './session-requests';
import { paneCardIn } from './status-lines';

// The `session` command's ports, built from what main holds. Every decision is session-requests.ts's;
// what is handed over here is the panes and the git that only main holds. Git runs on the project's
// queue, the one ships and reviews hold. Main-process wiring, out of main.ts, which had reached its
// 600-line ceiling.
export type SessionRequestMain = {
  projects: readonly (Project | undefined)[];
  readings: Pick<SlotPanes, 'slotOfProject' | 'openPanes' | 'agentIn' | 'agentRunsIn' | 'paneReadingsIn'>;
  commands: ReadonlyMap<string, PaneCommand>;
  mainsWorkers: ReadonlyMap<string, string>;
  workerScreens: Pick<ReturnType<typeof screenWorkers>, 'folder'>;
  openProject: SessionPorts['openProject'];
  pane: Pick<PaneActions, 'open' | 'dispatch' | 'close' | 'send'>;
  worktrees: Pick<ReturnType<typeof worktreeKeeper>, 'entries' | 'takePane'>;
  reviews: Pick<CardActions['reviews'], 'forget'>;
  giveCardPane(entry: WorktreeEntry, index: number): WorktreeEntry;
  sendToRenderer(channel: string, ...payload: unknown[]): void;
  prompt: SessionPorts['prompt'];
  browser: Pick<ReturnType<typeof browserActions>, 'turnEnded'>;
  chats: Pick<ReturnType<typeof registerChatSessions>, 'tell' | 'withdraw'>;
  worktree: Pick<ReturnType<typeof worktreeActions>, 'makeThrowaway' | 'throwawayPorts'>;
  hasKeyboard: SessionPorts['hasKeyboard'];
  boardLog: Pick<BoardChanges, 'latest'>;
  log(draft: LogDraft): void;
  pool: PoolPorts;
  stallMinutes(): number;
};

export function sessionRequestPorts(main: SessionRequestMain): SessionPorts {
  const { projects, readings, pane, worktrees, boardLog } = main;
  const projectIn = (slot: number): Project | undefined => projectInSlot(projects, slot);
  return {
    slotOf: (directory) => sessionSlot(projectOfFolder(projects.map((project) => project?.path), directory, realPath), directory, realPath),
    projectPath: (slot) => projectIn(slot)?.path,
    openSlots: () => [MANAGER_SLOT, ...projects.keys()].flatMap((slot) => {
      const project = projectIn(slot);
      return project === undefined ? [] : [{ slot, name: project.name }];
    }),
    findProject: projectNamedInFile,
    openProject: main.openProject,
    openPanes: readings.openPanes,
    agentIn: readings.agentIn,
    busyWith(id) {
      const { slot, index } = paneFromId(id);
      const reading = readings.paneReadingsIn(slot).find((each) => each.index === index);
      return reading !== undefined && paneIsBusy(reading) ? programIn(reading) : null;
    },
    directoryOf: (id) => main.workerScreens.folder(id) ?? main.commands.get(id)?.directory,
    dispatcherOf: (id) => main.mainsWorkers.get(id),
    open: (slot) => pane.open.call({ slot }),
    // A card's worker is the card's agent from here on, so its record names the pane, the way a ship's does,
    // and the card's last review is over, both halves of it as a ship clears them: left marked, the fix
    // this worker pushes would never be reviewed.
    startWorker(id, { directory, prompt, as, cardId, dispatcherPath }) {
      const entry = cardId === null ? undefined : entryForCard(worktrees.entries(), cardId);
      const { slot, index } = paneFromId(id);
      if (entry) {
        main.reviews.forget(entry.cardId);
        main.giveCardPane({ ...entry, reviewing: false }, index);
      } else {
        worktrees.takePane(projectIn(slot)?.path ?? '', index, '');
      }
      return pane.dispatch.call({ id, projectPath: projectIn(slot)?.path ?? directory, directory, prompt, resume: null, cardId, dispatcherPath, as });
    },
    close: (id) => pane.close.call({ id }),
    prompt: main.prompt,
    send: (id, text, dispatcherPath) => pane.send.call({ id, text, dispatcherPath }),
    mark: (id, state) => main.sendToRenderer('pane:mark', id, state), turnEnded: (id) => main.browser.turnEnded(id),
    tell: main.chats.tell,
    withdraw: (slot, messageId) => { main.chats.withdraw(slot, messageId).catch(() => undefined); },
    cardWorktree(projectPath, cardId) {
      const entry = entryForCard(worktrees.entries(), cardId);
      if (entry?.projectPath !== projectPath) return undefined;
      return { worktreePath: entry.worktreePath, working: readings.agentRunsIn(readings.slotOfProject(projectPath), entry.pane) };
    },
    makeWorktree: main.worktree.makeThrowaway,
    checkRunFolder,
    holdsWorktree,
    ...main.worktree.throwawayPorts,
    hasKeyboard: main.hasKeyboard,
    finishedCard(id) {
      const { slot, index } = paneFromId(id);
      return finishedCardIn(worktrees.entries(), projectIn(slot)?.path, index, boardLog.latest);
    },
    paneCard(id) {
      const { slot, index } = paneFromId(id);
      return paneCardIn(worktrees.entries(), projectIn(slot)?.path, index, boardLog.latest);
    },
    openPullRequests: (projectPath) => openPullRequests(runProgram, projectPath, 20_000),
    released(id, reason, output) {
      main.log({ level: 'info', kind: 'pane', project: projectIn(paneFromId(id).slot)?.path, message: `${output}: ${reason}` });
      main.sendToRenderer('pane:released', `Closed pane ${id}: ${reason}`);
    },
    threwAway: (id, said, projectPath) => main.log({ level: 'info', kind: 'worktree', project: projectPath, message: `pane ${id} closed: ${said}` }),
    log: (id, message) => main.log({ level: 'warn', kind: 'pane', project: projectIn(paneFromId(id).slot)?.path, message: `pane ${id} ${message}` }),
    realPath,
    pool: main.pool,
    stallMinutes: main.stallMinutes,
  };
}
