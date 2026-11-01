import type { OpenProjects } from '../../shared/app/bridge';
import { afterOpening, planSend, type SendPlan } from './free-pane';
import { panesById, type Page } from '../app/page';
import type { PaneUse } from '../../shared/panes/pane-reading';
import { terminalId } from '../../shared/panes/terminals';

// Two ways a key or a line reaches a pane without anybody going to it: the command screen's command
// typed into one shell per project, and the manager's answer typed into the pane that asked. Out of
// renderer.ts at its 600-line ceiling, along the seam the file had named for itself.

export type PaneSendPorts = {
  projectPages(): Page[];
  readPanes(projectPath: string): Promise<PaneUse[]>;
  // Main opens a worker and answers with its number and the list that has it on.
  addPane(slot: number): Promise<{ index: number; open: OpenProjects } | null>;
  applyProjects(open: OpenProjects): void;
  renderStatus(): void;
};

export function paneSends(ports: PaneSendPorts): {
  sendToPanes(command: string, paths: readonly string[]): Promise<SendPlan>;
  answerPane(slot: number, index: number, key: string): void;
  openWorker(slot: number): Promise<number | null>;
} {
  // A new worker, on its page before anything is typed into it or it is given the keyboard.
  async function openWorker(slot: number): Promise<number | null> {
    const added = await ports.addPane(slot);
    if (!added) return null;
    ports.applyProjects(added.open);
    return added.index;
  }

  // Typing the command screen's command into the shells themselves. That screen marks projects, so which
  // pane in each of them takes the line, and which projects can take it at all, is free-pane.ts's to
  // answer. terminal.input is the same door answerPane and a dropped file already go through, and the
  // carriage return is what an Enter in the pane sends.
  async function sendToPanes(command: string, paths: readonly string[]): Promise<SendPlan> {
    // One array, both jobs: what planSend is asked about, and where the line is then delivered. Two
    // collections built from the same filter is how a project comes to be planned for and not written
    // to, or written to after the plan has left it out.
    const chosen = ports.projectPages().filter((page) => paths.includes(page.project.path));
    // Every project's panes read at once rather than one after another, so what the plan is built from is
    // as near to one moment as this can make it. Asked of main: what is running in a pane is the pty's
    // foreground process, and reading the pane's own screen instead is what typed a line on top of a dev
    // server that had printed its banner and gone quiet.
    const uses = await Promise.all(chosen.map((page) => ports.readPanes(page.project.path)));
    const plan = planSend(chosen.map((page, index) => ({
      name: page.project.name,
      path: page.project.path,
      // A project whose folder has gone keeps its page, and that page has no panes — so free-pane.ts is
      // told why, rather than being left to report an empty project as one whose panes were all taken.
      missing: page.project.missing,
      // The terminals, never the editor. It rings a bell like a pane and is listed like one, but a
      // line of shell typed into nvim is not a command, it is an edit to whatever file is open.
      panes: uses[index],
    })));
    // The plan's own answer, keyed by the path it names, so nothing here decides a second time which
    // projects the command reaches. A path with no entry is one the plan deliberately left out — the
    // folder gone — which is why this loop skips it rather than looking for a pane.
    // A null pane is a project with no free worker, which gets a new one; a shell typed into before its
    // prompt is drawn reads the line once it is up. One that cannot be opened is the one skipped.
    const planned = new Map(plan.sends.map((send) => [send.path, send.paneIndex]));
    const unopened: Page['project'][] = [];
    for (const page of chosen) {
      if (!planned.has(page.project.path)) continue;
      const paneIndex = planned.get(page.project.path) ?? await openWorker(page.slot).catch(() => null);
      if (paneIndex === null) unopened.push(page.project);
      else panesById.get(terminalId(page.slot, paneIndex))?.terminal.input(`${command}\r`);
    }
    return afterOpening(plan, unopened);
  }

  // Answering a pane from the manager, without going to it. terminal.input is the door a dropped file
  // already goes through, so the key reaches the pty by the same path typing into the pane does. The
  // bell comes off because the pane has had its answer, and the pane rings again if it asks again. What
  // tells you the key landed is the row going from yellow `waiting` to dim `quiet` under a highlight
  // that has not moved — the row does not leave the list. That is what the highlight staying put is
  // for: the next character is dropped while the pane is quiet, and goes to that same pane the moment
  // it asks again, without anyone picking the row a second time.
  function answerPane(slot: number, index: number, key: string): void {
    const pane = panesById.get(terminalId(slot, index));
    if (!pane) return;
    pane.terminal.input(key);
    pane.bell = 'quiet';
    ports.renderStatus();
  }

  return { sendToPanes, answerPane, openWorker };
}
