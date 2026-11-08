import { startsAtOpen } from '../../chat/chat-start';
import { action } from '../action';
import { isSlot } from '../pane/pane-input';

// A session started before anyone looks at it. Otherwise a page's main waits to be shown, told
// something, or reported to (chat-start.ts), and a prompt or the screen's first measure starts it.
// Three doors start one sooner:
// - `restart`: a page's main whose worker came back after a restart, asked of every open page once a
//   page opens or the hosts answer; startsAtOpen says which.
// - `kept`: a worker screen the screen host kept through a restart, taken back.
// - `command`: `dashboard project open`, which answers only once main can be reached (project.open).

const FROMS = ['restart', 'kept', 'command'] as const;

export type SessionStartFrom = typeof FROMS[number];

export type SessionStartPorts = {
  // The project open in the slot, or undefined.
  projectAt(slot: number): { path: string; missing: boolean } | undefined;
  // The folder of the main each of main's worker panes reports to.
  dispatchers(): Iterable<string>;
  // The session started if it is not running, answering its name once it has initialised: Claude Code
  // has registered the name by then, so another session's SendMessage reaches it.
  start(slot: number): Promise<string>;
};

export const sessionStart = action<SessionStartPorts, { slot: number; from: SessionStartFrom }, { output: string; name: string | null }>('session.start', {
  words: [],
  input: ({ slot, from }) => (
    isSlot(slot) && FROMS.includes(from as SessionStartFrom)
      ? { slot, from: from as SessionStartFrom }
      : { refused: 'the session to start was not one the app could read' }
  ),
  // Nothing is awaited before `start` is called, so a session the restart starts is running by the
  // time `call` returns (bind's note in action.ts).
  async run(ports, { slot, from }) {
    if (from === 'restart') {
      const project = ports.projectAt(slot);
      if (project === undefined || project.missing || !startsAtOpen(project.path, ports.dispatchers())) {
        return { output: 'waits to be shown', name: null };
      }
    }
    const name = await ports.start(slot);
    return { output: `${name} is running`, name };
  },
});
