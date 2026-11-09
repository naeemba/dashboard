import type { Refused, WorktreeEntry } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import type { PaneCommand } from '../../../shared/panes/pane-reading';
import { nextPaneIndex } from '../../../shared/panes/pane-layout';
import { MAIN_INDEX, paneFromId, terminalId } from '../../../shared/panes/terminals';
import { adoptedPane } from '../../panes/adopted-pane';
import { paneOfKey, type Survivor } from '../../panes/pane-host-protocol';
import type { PaneShell } from '../../panes/pane-shell';
import { agentToResume, isPaneConversation, workerDispatcher, type PaneConversation } from '../../workers/claude-resume';
import { action, isRefused } from '../action';
import { stopOrWarn, type PaneClosePorts } from './close';
import type { PaneDispatchInput } from './dispatch';
import { isFilledText, isSlot } from './pane-input';

// What each pane a page had when the app last quit comes back as, once the page opens again: a shell
// the pane host kept, adopted as it was; a conversation saved for a pane, carried on through
// pane.dispatch; a worker screen, back over its pane. A card's agent names its pane on the card's
// record again, so the status bar prints the branch, a second ship is refused and the review sweep waits
// for it; a worker main dispatched is main's again.
//
// Every pane is set before the first await, as dispatch's are: the page's open goes on to start the
// mains its workers report to and to send the page list, and both read what is here.

export type PaneRestoreInput = {
  slot: number;
  projectPath: string;
  // The conversation saved for the page's first pane that was not main's (mainResume), which comes back
  // in a worker after the rest, or null.
  firstPane: PaneConversation | null;
};

// A worker screen saved for the page (screen-workers.ts's comeBack).
export type ScreenBack = { index: number; directory: string; session: string; dispatcherPath: string | null };

// pane.close's stop, for a kept shell not taken back.
export type PaneRestorePorts = Pick<PaneClosePorts, 'stopScope'> & {
  // The shells the pane host kept for the project (pane-host-client.ts).
  kept(projectPath: string): { survivor: Survivor; shell: PaneShell }[];
  // `unit` is the systemd scope the host started it in, when it has one.
  listenTo(id: string, shell: PaneShell, file: string, unit: string | undefined): void;
  takeResume(projectPath: string, index: number, id: string): PaneConversation | null;
  owedResumes(projectPath: string): number[];
  moveResume(fromId: string, toId: string): void;
  // The page's worker screens back in their panes, each started again (screen-workers.ts).
  screensBack(slot: number, projectPath: string): ScreenBack[];
  worktrees(): readonly WorktreeEntry[];
  // The pane each card's record named before the launch cleared them.
  panesBeforeLaunch: ReadonlyMap<string, number>;
  realPath(path: string): string;
  // The card's record names the pane again (worktree-keeper.ts's givePane).
  givePane(entry: WorktreeEntry, index: number): void;
  mainsWorkers: Pick<Map<string, string>, 'set'>;
  hasCommand(id: string): boolean;
  // What the pane runs, announced to every screen when the pane is new.
  setPaneCommand(id: string, command: PaneCommand): void;
  // The pane held for a resume about to start in it, unannounced: the page's open sends the list once.
  reserve(id: string, directory: string): void;
  spawn(id: string): void;
  openPanes(slot: number): readonly number[];
  dispatch(input: PaneDispatchInput): Promise<{ output: string } | Refused>;
  // A scope left running is a warning: the page's open reads only a refusal.
  log(draft: LogDraft): void;
};

function paneRestoreInput(raw: Record<string, unknown>): PaneRestoreInput | Refused {
  const { slot, projectPath, firstPane = null } = raw;
  if (!isSlot(slot) || !isFilledText(projectPath)) return { refused: 'no page was given' };
  if (firstPane !== null && !isPaneConversation(firstPane)) return { refused: 'the saved conversation was not one the app could read' };
  return { slot, projectPath, firstPane };
}

export const paneRestore = action<PaneRestorePorts, PaneRestoreInput, { output: string }>('pane.restore', {
  words: [],
  input: paneRestoreInput,
  async run(ports, { slot, projectPath, firstPane }) {
    // Before the resumes, which skip the panes taken here. A shell not taken back is killed and its
    // scope stopped after, as pane.close stops one, so what it detached does not run on unseen.
    const stops: Promise<string | null>[] = [];
    for (const { survivor, shell } of ports.kept(projectPath)) {
      const { index } = paneOfKey(survivor.key);
      const id = terminalId(slot, index);
      const saved = ports.takeResume(projectPath, index, id);
      const pane = adoptedPane(survivor, saved, ports.worktrees(), ports.panesBeforeLaunch, ports.realPath);
      if (pane === undefined) {
        shell.kill();
        if (survivor.unit !== undefined) stops.push(stopOrWarn(ports, survivor.unit, 'pane.restore', id));
        continue;
      }
      ports.setPaneCommand(id, pane.command);
      ports.listenTo(id, shell, survivor.file, survivor.unit);
      if (pane.card !== undefined) ports.givePane(pane.card, index);
      if (pane.worker && saved !== null) ports.mainsWorkers.set(id, workerDispatcher(saved, projectPath));
    }

    // A card's agent comes back as it, exactly as the ship started it; agentToResume says which sessions
    // those are. A worker main dispatched comes back as main's worker, its hooks reporting to the pane it
    // is in now. Anything else is a Claude of yours.
    const resume = (id: string, savedIndex: number, conversation: PaneConversation) => {
      const card = agentToResume(ports.worktrees(), ports.panesBeforeLaunch, conversation, projectPath, savedIndex, ports.realPath);
      if (card !== undefined) ports.givePane(card, paneFromId(id).index);
      const dispatcherPath = conversation.dispatched === true ? workerDispatcher(conversation, projectPath) : null;
      return ports.dispatch({
        id, projectPath, directory: card?.worktreePath ?? conversation.directory, prompt: null,
        resume: conversation.session, cardId: null, dispatcherPath, as: null,
      });
    };
    const started: Promise<{ output: string } | Refused>[] = [];
    for (const index of ports.owedResumes(projectPath)) {
      const id = terminalId(slot, index);
      const owed = ports.takeResume(projectPath, index, id);
      ports.reserve(id, projectPath);
      if (owed !== null) started.push(resume(id, index, owed));
    }
    if (firstPane !== null) {
      const id = terminalId(slot, nextPaneIndex(ports.openPanes(slot)));
      ports.reserve(id, projectPath);
      ports.moveResume(terminalId(slot, MAIN_INDEX), id);
      started.push(resume(id, MAIN_INDEX, firstPane));
    }

    // The pane opened again if it closed. One opened by hand comes back as yours, not as main's worker.
    for (const back of ports.screensBack(slot, projectPath)) {
      const id = terminalId(slot, back.index);
      if (!ports.hasCommand(id)) {
        ports.setPaneCommand(id, { args: [], directory: back.directory });
        ports.spawn(id);
      }
      if (back.dispatcherPath !== null) ports.mainsWorkers.set(id, back.dispatcherPath);
      const card = agentToResume(ports.worktrees(), ports.panesBeforeLaunch, back, projectPath, back.index, ports.realPath);
      if (card !== undefined) ports.givePane(card, back.index);
    }

    await Promise.all(stops);
    const refusals = (await Promise.all(started)).filter(isRefused);
    if (refusals.length > 0) return { refused: refusals.map((each) => each.refused).join('; ') };
    return { output: `${started.length} conversations carried on in ${projectPath}` };
  },
});
