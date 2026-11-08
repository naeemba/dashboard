import type { Refused } from '../../../shared/app/bridge';
import { nextPaneIndex } from '../../../shared/panes/pane-layout';
import { terminalId } from '../../../shared/panes/terminals';
import { action, isRefused } from '../action';
import type { PaneDispatchInput } from './dispatch';
import { isFilledTextOrNull, isSlot } from './pane-input';

// A new worker pane on a page, at the lowest number going: a plain shell, a Claude screen waiting for
// its first prompt (New Claude), or a conversation carried on (the drawer's resume). Every agent in it
// is started by pane.dispatch, so nothing here types `claude --resume` into a shell.

export type PaneOpenInput = {
  slot: number;
  // Where it stands, or null for the project's own folder.
  directory: string | null;
  // A Claude in it rather than a shell: a new screen, or `resume`'s conversation in the terminal.
  claude: boolean;
  resume: string | null;
};

export type PaneOpenPorts = {
  // The page's project, or undefined for a slot that holds none.
  project(slot: number): { path: string; missing: boolean } | undefined;
  openPanes(slot: number): readonly number[];
  // A plain shell in the folder, the pane opening with it.
  shell(id: string, directory: string): void;
  dispatch(input: PaneDispatchInput): Promise<{ output: string } | Refused>;
};

export function paneOpenInput(raw: Record<string, unknown>): PaneOpenInput | Refused {
  const { slot, directory = null, claude = false, resume = null } = raw;
  if (!isSlot(slot)) return { refused: 'no page was given' };
  if (!isFilledTextOrNull(directory) || typeof claude !== 'boolean' || !isFilledTextOrNull(resume)) {
    return { refused: 'the pane request was not one the app could read' };
  }
  return { slot, directory, claude, resume };
}

export const paneOpen = action<PaneOpenPorts, PaneOpenInput, { output: string; index: number }>('pane.open', {
  words: [],
  input: paneOpenInput,
  async run(ports, { slot, directory, claude, resume }) {
    const project = ports.project(slot);
    if (project === undefined) return { refused: 'That project is closed' };
    // Its own folder is not there to stand in. A folder handed over (a resume's) is checked by its door.
    if (project.missing && directory === null) return { refused: `${project.path} is not there` };
    const index = nextPaneIndex(ports.openPanes(slot));
    const id = terminalId(slot, index);
    const folder = directory ?? project.path;
    if (!claude && resume === null) {
      ports.shell(id, folder);
      return { output: `opened ${id}`, index };
    }
    const started = await ports.dispatch({
      id, projectPath: project.path, directory: folder, prompt: null, resume, cardId: null, dispatcherPath: null, as: null,
    });
    return isRefused(started) ? started : { output: started.output, index };
  },
});
