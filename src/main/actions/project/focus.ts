import { MAIN_INDEX, terminalId } from '../../../shared/panes/terminals';
import { action } from '../action';
import { isFilledText, isSlot } from '../pane/pane-input';

// The window to the front on a project's page: `dashboard project focus` lands on its main, a
// notification's click on the pane the banner named.

export type ProjectFocusInput = { slot: number; index: number | null; name: string | null };

export type ProjectFocusPorts = {
  isOpen(slot: number): boolean;
  land(paneId: string): void;
};

function read(raw: Record<string, unknown>): ProjectFocusInput | null {
  const { slot, index = null, name = null } = raw;
  if (!isSlot(slot) || !(index === null || Number.isInteger(index)) || !(name === null || isFilledText(name))) return null;
  return { slot, index: index as number | null, name };
}

export const projectFocus = action<ProjectFocusPorts, ProjectFocusInput, { output: string }>('project.focus', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the pane to land on was not one the app could read' },
  async run(ports, { slot, index, name }) {
    const paneId = terminalId(slot, index ?? MAIN_INDEX);
    // A banner raised before its project closed lands nowhere.
    if (!ports.isOpen(slot)) return { refused: `${name ?? paneId} is not open` };
    ports.land(paneId);
    return { output: `switched to ${name ?? paneId}` };
  },
});
