import { MAIN_INDEX, terminalId } from '../../../shared/panes/terminals';
import { action } from '../action';
import { isSlot } from '../pane/pane-input';

// The window to the front on a project's page: `dashboard project focus` lands on its main, a
// notification's click on the pane the banner named.

export type ProjectFocusInput = { slot: number; index: number | null };

export type ProjectFocusPorts = {
  land(paneId: string): void;
};

export const projectFocus = action<ProjectFocusPorts, ProjectFocusInput, { output: string }>('project.focus', {
  words: [],
  input: ({ slot, index = null }) => (isSlot(slot) && (index === null || Number.isInteger(index))
    ? { slot, index: index as number | null }
    : { refused: 'the pane to land on was not one the app could read' }),
  async run(ports, { slot, index }) {
    const paneId = terminalId(slot, index ?? MAIN_INDEX);
    ports.land(paneId);
    return { output: `landed on ${paneId}` };
  },
});
