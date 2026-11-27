import type { OpenProjects, Project } from '../../shared/app/bridge';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { nextPaneIndex } from '../../shared/panes/pane-layout';
import { freePane, hasAnAgent, shipCanTake, type PaneCommand, type PaneReading, type PaneUse } from '../../shared/panes/pane-reading';
import { EDITOR_INDEX, terminalId, workersOfSlot } from '../../shared/panes/terminals';
import type { WorkingPanes } from '../../shared/panes/working-panes';
import { realPath } from '../app/real-path';
import { projectInSlot } from '../manager/manager-terminals';

// What main reads off its open projects and their panes: which page a project is on, the workers it has
// open, what each one runs, and whether an agent is in one and still working. Out of main.ts, which had
// reached its 600-line ceiling; main holds the maps and hands them over, and every question asked of
// them is answered here.
export type SlotPaneSources = {
  projects: readonly (Project | undefined)[];
  // What each terminal id runs and where. A pane is open while it has a command.
  commands: ReadonlyMap<string, PaneCommand>;
  // The panes with a live shell: a pane missing here has exited.
  shells: ReadonlyMap<string, unknown>;
  foregroundOf(id: string): string | undefined;
  startedWith: ReadonlyMap<string, string>;
  // The Claude screens, read late: they are made after these readers, and only asked once both exist.
  workerScreens(): { has(id: string): boolean; working(id: string): boolean | undefined; ids(): string[] };
  agentsAtWork: Pick<WorkingPanes, 'works'>;
};

export function slotPanes(sources: SlotPaneSources) {
  const { projects, commands } = sources;

  // Which page a project is open on, or -1. Two questions want it — opening a project that is already
  // open, and finding the panes a review can take — and two copies of the walk would answer differently
  // the day a slot means something other than an index into this array. Compared through realPath, as
  // projectOfFolder does for the session command, so a folder opened through a symlink and named in
  // projects.yaml by its real path is one project, not two pages on the same shells and board.
  function slotOfProject(projectPath: string): number {
    const real = realPath(projectPath);
    return projects.findIndex((project) => project !== undefined && realPath(project.path) === real);
  }

  // The workers a project has open, ascending: every pane main holds a command for, less the editor.
  function openPanes(slot: number): number[] {
    return workersOfSlot(commands.keys(), slot);
  }

  // Every open terminal of the project as pane-reading.ts reads them.
  function paneReadingsIn(slot: number): PaneReading[] {
    const projectPath = projectInSlot(projects, slot)?.path;
    return openPanes(slot).map((index): PaneReading => {
      const id = terminalId(slot, index);
      const command = commands.get(id);
      return {
        index,
        foreground: sources.foregroundOf(id),
        shell: sources.startedWith.get(id),
        command,
        inWorktree: command !== undefined && command.directory !== projectPath,
        screen: sources.workerScreens().has(id),
      };
    });
  }

  // `exited` is the one field a reading has no room for, and it is main's too — the shells map is what
  // `pty:exit` is sent from, so the renderer's own flag is a copy of this one.
  function paneUsesIn(slot: number): PaneUse[] {
    return paneReadingsIn(slot)
      .map((pane) => ({ ...pane, exited: !sources.shells.has(terminalId(slot, pane.index)) }));
  }

  // The lowest-numbered worker of this project that nobody is using, or the number a new one would get
  // when every worker is taken: workers are opened as they are needed, so there is always one going.
  // What counts as free is shipCanTake's.
  function freePaneIn(slot: number): number {
    return freePane(paneReadingsIn(slot), shipCanTake) ?? nextPaneIndex(openPanes(slot));
  }

  // A worker on a Claude screen runs no command in its pane, whose shell stays a plain one under it.
  const agentIn = (id: string): boolean => hasAnAgent({ command: commands.get(id), screen: sources.workerScreens().has(id) });

  // Whether an agent is running in this card's pane. One spelling of it, because two things ask: the ship
  // refuses a card that is already being worked, and the review sweep will not take a worktree away from
  // a shell sitting in it. Two copies drift — widen the ship's half to count a pane whose agent has
  // finished, leave the sweep's alone, and five seconds later the sweep removes the folder out from
  // under that shell.
  function agentRunsIn(slot: number, pane: number | null): boolean {
    return pane !== null && agentIn(terminalId(slot, pane));
  }

  // The question the review asks, which is the one above with "and has not finished" on the end. A ship
  // is a keystroke and refuses on the weaker answer: you pressed it, and the status bar you are already
  // looking at says why. The sweep runs on a five-second timer with nobody to tell, so an answer that
  // only goes false when you close the pane by hand would mean no review ever starts by itself — the
  // card sits in Ship reading `shipped · fix-login · terminal 3` all day with nothing on screen saying
  // the app is waiting on you.
  function agentWorksIn(slot: number, pane: number | null): boolean {
    if (pane === null || !agentRunsIn(slot, pane)) return false;
    const id = terminalId(slot, pane);
    return sources.workerScreens().working(id) ?? sources.agentsAtWork.works(id, Date.now());
  }

  // The list every screen draws its tabs from, with the terminals each one has open, so a screen arriving
  // at the session builds every worker before the replay of what they printed. Which session it is the
  // list of travels on its own, as `host:change` from remote-ipc.ts.
  const openProjects = (): OpenProjects => ({
    projects: projects.map((project) => project ?? null),
    panes: projects.map((_project, slot) => openPanes(slot)),
    manager: openPanes(MANAGER_SLOT),
    screens: sources.workerScreens().ids(),
    editors: projects.flatMap((_project, slot) => (sources.shells.has(terminalId(slot, EDITOR_INDEX)) ? [slot] : [])),
  });

  return { slotOfProject, openPanes, paneReadingsIn, paneUsesIn, freePaneIn, agentIn, agentRunsIn, agentWorksIn, openProjects };
}

export type SlotPanes = ReturnType<typeof slotPanes>;
