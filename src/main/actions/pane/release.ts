import type { Refused } from '../../../shared/app/bridge';
import { action, isRefused } from '../action';
import { isFilledText } from './pane-input';
import { letGoOf, letGoText, type Throwaway, type ThrowawayPorts } from '../worktree/throwaway';

// `pane release`: the worker closed, unless what runs in it is somebody else's, and the throwaway
// worktree it was given removed once nothing in it would be lost (throwaway.ts). The asker's right to
// the pane is the command's to check first (session-requests.ts).

export type PaneReleasePorts = ThrowawayPorts & {
  // What is running in the pane when something is, or null.
  busyWith(id: string): string | null;
  // Whether what runs there is main's worker, which release may kill. Anything else is somebody else's:
  // a dev server, a card a ship gave an agent.
  mainsWorker(id: string): boolean;
  // pane.close.
  close(id: string): Promise<{ output: string } | Refused>;
  // Everything the command held of the pane let go of, and the throwaway worktree it was given, if any.
  // That includes its stop notice, which `close` has already let go of as it dropped the pane: one still
  // waiting in main's queue is taken back, since main hears a report only once the turn that read it
  // ends, and that turn is the one releasing the worker (workers-decision-1).
  forget(id: string): Throwaway | undefined;
};

export const paneRelease = action<PaneReleasePorts, { id: string }, { output: string }>('pane.release', {
  words: [],
  input: ({ id }) => (isFilledText(id) ? { id } : { refused: 'no pane was given' }),
  async run(ports, { id }) {
    const program = ports.busyWith(id);
    if (program !== null && !ports.mainsWorker(id)) return { refused: `${id} is running ${program}, which no session run started — close it by hand` };
    const closed = await ports.close(id);
    if (isRefused(closed)) return closed;
    // What close said past `closed <id>`, a scope it could not stop, is said here too.
    const closeNote = closed.output.slice(`closed ${id}`.length);
    const throwaway = ports.forget(id);
    if (throwaway === undefined) return { output: `released ${id}${closeNote}` };
    const outcome = await letGoOf(ports, throwaway);
    if ('removed' in outcome) return { output: `released ${id} and removed ${outcome.removed}${closeNote}` };
    if ('gone' in outcome) return { output: `released ${id}; ${letGoText(outcome)}${closeNote}` };
    return { output: `released ${id}${closeNote}; ${letGoText(outcome)}` };
  },
});
