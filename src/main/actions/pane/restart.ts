import type { Refused } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { action } from '../action';
import { stopOrWarn, type PaneClosePorts } from './close';
import { isFilledText } from './pane-input';

// A pane's shell started again where it ran: Enter on a pane whose shell exited (`pty:restart`), and a
// dispatch starting a pane's shell over once it has killed the old one. The old shell's scope is
// stopped once the new shell has one of its own (each start is named afresh, so the stop never reaches
// the new one), so what the old shell detached ends with it, as a close ends it. A spawn that started
// nothing (no command, or a shell that would not start) leaves the old unit in `scopeOf`, so the stop
// goes by whether a shell runs now, not by whether the unit changed.

// `scopeOf` reads the old shell's scope before the spawn and the new one's after it.
export type PaneRestartPorts = Pick<PaneClosePorts, 'scopeOf' | 'stopScope'> & {
  // Whether the pane has a shell now: one that runs is never started a second time over it.
  running(id: string): boolean;
  spawn(id: string): void;
  // A scope left running is a warning: neither door reads the answer.
  log(draft: LogDraft): void;
};

export const paneRestart = action<PaneRestartPorts, { id: string }, { output: string }>('pane.restart', {
  words: [],
  input: ({ id }) => (isFilledText(id) ? { id } : { refused: 'no pane was given' }),
  async run(ports, { id }): Promise<{ output: string } | Refused> {
    if (ports.running(id)) return { refused: `${id} has a shell running` };
    const replaced = ports.scopeOf(id);
    ports.spawn(id);
    const keptByNewShell = ports.running(id) && replaced === ports.scopeOf(id);
    const notStopped = replaced === undefined || keptByNewShell ? null : await stopOrWarn(ports, replaced, 'pane.restart', id);
    return { output: notStopped === null ? `restarted ${id}` : `restarted ${id}; ${notStopped}` };
  },
});
