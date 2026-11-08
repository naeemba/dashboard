import { closeRefusal, closingPanes, type PaneName } from '../../../shared/panes/close-refusal';
import type { PaneUse } from '../../../shared/panes/pane-reading';
import { action } from '../action';
import { isFilledText, isSlot } from '../pane/pane-input';

// A project closed: by the close key, which asks this once before its question and again with the
// answer, and by `dashboard project close`, which has nobody at the keyboard to ask. Whether it may
// go is closeRefusal's, asked here and nowhere else, so neither door can close over something the
// other would have refused.

export type ProjectCloseInput = {
  slot: number;
  // The project as the door names it in a refusal: the page's name, or the word projects.yaml has.
  name: string;
  // The page's names for its panes, any you gave one among them; null for the command, which names
  // them the way the close key does by default.
  names: PaneName[] | null;
  // Only whether it may close, answered before the close key's question: nothing is closed.
  onlyCheck: boolean;
};

export type ProjectClosePorts = {
  isOpen(slot: number): boolean;
  // The project's terminals as main reads them, editor left out: it runs nvim the whole time it is open.
  panesOf(slot: number): PaneUse[];
  // A pane's name when nobody has given it one.
  labelOf(index: number): string;
  // Shells, editor, main's session and page gone, and every record naming one of its panes let go.
  close(slot: number): void;
};

function read(raw: Record<string, unknown>): ProjectCloseInput | null {
  const { slot, name, names = null, onlyCheck = false } = raw;
  if (!isSlot(slot) || !isFilledText(name) || typeof onlyCheck !== 'boolean') return null;
  if (names !== null && !(Array.isArray(names) && names.every(isPaneName))) return null;
  return { slot, name, names, onlyCheck };
}

function isPaneName(value: unknown): value is PaneName {
  const named = value as PaneName;
  return typeof value === 'object' && value !== null && Number.isInteger(named.index) && typeof named.name === 'string';
}

export const projectClose = action<ProjectClosePorts, ProjectCloseInput, { output: string }>('project.close', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the project to close was not one the app could read' },
  async run(ports, { slot, name, names, onlyCheck }) {
    if (!ports.isOpen(slot)) return { refused: `${name} is not open` };
    // The command's refusal and nothing else: no question. The cost: an unsaved buffer in the project's
    // editor, which the refusal never reads, goes with the rest, where the key would have asked first.
    const uses = ports.panesOf(slot);
    const named = names ?? uses.map((use) => ({ index: use.index, name: ports.labelOf(use.index) }));
    const refusal = closeRefusal(name, closingPanes(uses, named));
    if (refusal !== '') return { refused: refusal };
    if (onlyCheck) return { output: `${name} may close` };
    ports.close(slot);
    return { output: `closed ${name}` };
  },
});
