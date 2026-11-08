import type { Refused } from '../../../shared/app/bridge';
import { paneFromId } from '../../../shared/panes/terminals';
import { action } from '../action';
import { isFilledText } from './pane-input';

// A worker pane closed for good: by its close key or button, or by `pane release`. Only a worker that is
// open: main is the Claude screen and the editor is not in the list.

export type PaneClosePorts = {
  openPanes(slot: number): readonly number[];
  project(slot: number): { path: string } | undefined;
  // Everything the pane was let go of: its shell, its screen, main's claim and the command's answers.
  drop(id: string): void;
  // A card's record naming the pane gives it up, so the card is not counted as sitting in a pane that is gone.
  endClaim(projectPath: string, index: number): void;
  // Every screen redraws its pages.
  changed(): void;
};

export const paneClose = action<PaneClosePorts, { id: string }, { output: string }>('pane.close', {
  words: [],
  input: ({ id }) => (isFilledText(id) ? { id } : { refused: 'no pane was given' }),
  async run(ports, { id }): Promise<{ output: string } | Refused> {
    const { slot, index } = paneFromId(id);
    if (!ports.openPanes(slot).includes(index)) return { refused: `${id} is not open` };
    ports.drop(id);
    ports.endClaim(ports.project(slot)?.path ?? '', index);
    ports.changed();
    return { output: `closed ${id}` };
  },
});
