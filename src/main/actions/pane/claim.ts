import type { Refused } from '../../../shared/app/bridge';
import { terminalId } from '../../../shared/panes/terminals';
import type { ProjectNamed } from '../../projects/project-named';
import { action, isRefused } from '../action';
import { isFilledTextOrNull, isSlot } from './pane-input';

// `pane claim`: a fresh worker on the asker's own page, or with --project on the page of the project
// projects.yaml names, which is opened first if it is closed. Every claim settles who claimed the id,
// so a pane number claimed again never keeps the rights of whoever claimed it before. Only a claim or a
// release settles it: a claimed pane closed by hand and reopened by the new-terminal key stays the
// claimer's, as a project's own panes already are its main's.

export type PaneClaimInput = {
  // The asking page, or -1 from a folder outside every project.
  slot: number;
  // The --project word, or null for the asker's own page.
  project: string | null;
};

export type PaneClaimPorts = {
  findProject(word: string): ProjectNamed;
  folderExists(path: string): boolean;
  // Opens the project at the path unless it is open already, and answers with its slot either way.
  openProject(path: string): number;
  // pane.open: a shell in the project's folder.
  open(slot: number): Promise<{ index: number } | Refused>;
  // The page that may run and release the pane from now on besides its own, or null for its own alone.
  claimedBy(id: string, slot: number | null): void;
};

export const paneClaim = action<PaneClaimPorts, PaneClaimInput, { output: string }>('pane.claim', {
  words: [],
  input: ({ slot, project = null }) => (isSlot(slot) && isFilledTextOrNull(project) ? { slot, project } : { refused: 'the claim was not one the app could read' }),
  async run(ports, { slot, project }) {
    let target = slot;
    if (project !== null) {
      const found = ports.findProject(project);
      if (!found.ok) return { refused: found.message };
      if (!ports.folderExists(found.path)) return { refused: `${found.name} is at ${found.path}, which is not a folder` };
      target = ports.openProject(found.path);
    }
    const opened = await ports.open(target);
    if (isRefused(opened)) return opened;
    const id = terminalId(target, opened.index);
    ports.claimedBy(id, target === slot || slot === -1 ? null : slot);
    return { output: id };
  },
});
