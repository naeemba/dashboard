import { closeRefusal, closingPanes, type PaneName } from '../../../shared/panes/close-refusal';
import type { ProjectClose } from '../../../shared/app/bridge';
import { isRecord } from '../../../shared/app/is-record';
import type { PaneUse } from '../../../shared/panes/pane-reading';
import { paneLabel } from '../../../shared/panes/terminals';
import { action } from '../action';
import { notStoppedText } from '../pane/close';
import { isFilledText, isSlot } from '../pane/pane-input';

// A project closed: by the close key, which asks this once before its question and again with the
// answer, and by `dashboard project close`, which has nobody at the keyboard to ask. Whether it may
// go is closeRefusal's, asked here and nowhere else, so neither door can close over something the
// other would have refused.

// The close key's request (`ProjectClose`), or the command's: `name` is the word projects.yaml has, and
// `names` null, so its panes are named the way the close key names them by default.
export type ProjectCloseInput = Omit<ProjectClose, 'names'> & { names: PaneName[] | null };

export type ProjectClosePorts = {
  isOpen(slot: number): boolean;
  // The project's terminals as main reads them, editor left out: it runs nvim the whole time it is open.
  panesOf(slot: number): PaneUse[];
  // The systemd scope of each of its panes' shells, the editor's included: those started unscoped have none.
  scopesOf(slot: number): string[];
  // Shells, editor, main's session and page gone, and every record naming one of its panes let go.
  close(slot: number): void;
  // pane.close's stop: every process left in the scope ended. A scope already gone is not a failure.
  stopScope(unit: string): Promise<void>;
};

function read(raw: Record<string, unknown>): ProjectCloseInput | null {
  const { slot, name, names = null, onlyCheck = false } = raw;
  if (!isSlot(slot) || !isFilledText(name) || typeof onlyCheck !== 'boolean') return null;
  if (names !== null && !(Array.isArray(names) && names.every(isPaneName))) return null;
  return { slot, name, names, onlyCheck };
}

function isPaneName(value: unknown): value is PaneName {
  return isRecord(value) && Number.isInteger(value.index) && typeof value.name === 'string';
}

export const projectClose = action<ProjectClosePorts, ProjectCloseInput, { output: string }>('project.close', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the project to close was not one the app could read' },
  async run(ports, { slot, name, names, onlyCheck }) {
    if (!ports.isOpen(slot)) return { refused: `${name} is not open` };
    // The command's refusal and nothing else: no question. The cost: an unsaved buffer in the project's
    // editor, which the refusal never reads, goes with the rest, where the key would have asked first.
    const uses = ports.panesOf(slot);
    const closing = names === null ? uses.map((use) => ({ ...use, name: paneLabel(use.index) })) : closingPanes(uses, names);
    const refusal = closeRefusal(name, closing);
    if (refusal !== '') return { refused: refusal };
    if (onlyCheck) return { output: `${name} may close` };
    // Read before the close, which forgets them; stopped after it, as pane.close stops one, so what a
    // shell detached (a dev server) goes with the project. The project is closed either way; a scope
    // left running is said, not hidden.
    const units = ports.scopesOf(slot);
    ports.close(slot);
    const stops = await Promise.allSettled(units.map((unit) => ports.stopScope(unit)));
    const notStopped = stops.flatMap((stop, at) => (stop.status === 'rejected' ? [notStoppedText(units[at], stop.reason)] : []));
    return { output: [`closed ${name}`, ...notStopped].join('; ') };
  },
});
