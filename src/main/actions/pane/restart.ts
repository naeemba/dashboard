import type { Refused } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { paneFromId } from '../../../shared/panes/terminals';
import { action } from '../action';
import { notStoppedText } from './close';
import { isFilledText } from './pane-input';

// A pane's shell started again where it ran: Enter on a pane whose shell exited (`pty:restart`), and a
// dispatch starting a pane's shell over once it has killed the old one. The old shell's scope is
// stopped once the new shell has one of its own (each start is named afresh, so the stop never reaches
// the new one), so what the old shell detached ends with it, as a close ends it.

export type PaneRestartPorts = {
  // Whether the pane has a shell now: one that runs is never started a second time over it.
  running(id: string): boolean;
  // The pane's scope as main holds it: the old shell's before the spawn, the new one's after.
  scopeOf(id: string): string | undefined;
  spawn(id: string): void;
  // pane.close's stop. A scope already gone is not a failure.
  stopScope(unit: string): Promise<void>;
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
    if (replaced === undefined || replaced === ports.scopeOf(id)) return { output: `restarted ${id}` };
    try {
      await ports.stopScope(replaced);
    } catch (error: unknown) {
      const message = notStoppedText(replaced, error);
      const { slot, index } = paneFromId(id);
      ports.log({ level: 'warn', kind: 'pane', action: 'pane.restart', message, context: { slot, pane: index } });
      return { output: `restarted ${id}; ${message}` };
    }
    return { output: `restarted ${id}` };
  },
});
