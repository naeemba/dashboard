import { failureText } from '../../../shared/errors/failure';
import { renameTarget } from '../../../shared/chat/chat-rename';
import { action } from '../action';
import { isFilledText, isSlot } from '../pane/pane-input';

// A conversation renamed: by /rename on the Claude screen, or by F2 in the drawer. A conversation has
// one name in two places, its transcript's title, which /resume lists it by, and its row's label,
// which the drawer lists it by, and both doors write both. Before, each wrote only its own, so a
// conversation renamed in the drawer kept its old name in /resume.

export type SessionRenameInput = { slot: number; title: string } | { id: string; label: string };

export type SessionRenamePorts = {
  // The conversation /resume marks as the page's, or null with none yet or a rewind waiting.
  onScreen(slot: number): string | null;
  // The folder the page's session runs in.
  projectPath(slot: number): string | undefined;
  // The folder the drawer's row says the conversation ran in, or undefined for one with no row.
  directoryOf(sessionId: string): string | undefined;
  // The drawer's row relabelled, or why not (session-index.ts's `renamed`).
  relabel(sessionId: string, label: string): string | null;
  // The title written into the conversation's transcript, which lives under its folder.
  retitle(sessionId: string, title: string, folder: string | undefined): Promise<void>;
};

function read(raw: Record<string, unknown>): SessionRenameInput | null {
  const { slot, title, id, label } = raw;
  if (isSlot(slot) && typeof title === 'string') return { slot, title };
  if (isFilledText(id) && typeof label === 'string') return { id, label };
  return null;
}

// What a rename names, whichever door asked: the conversation, the name trimmed, and the folder its
// transcript lives under. /rename's own refusals (renameTarget) come here; the drawer's are its row's.
function targetOf(ports: SessionRenamePorts, input: SessionRenameInput): { sessionId: string; title: string; folder: string | undefined } | { refused: string } {
  if (!('slot' in input)) return { sessionId: input.id, title: input.label.trim(), folder: ports.directoryOf(input.id) };
  const target = renameTarget(ports.onScreen(input.slot), input.title.trim());
  return 'refused' in target ? target : { ...target, folder: ports.projectPath(input.slot) };
}

export const sessionRename = action<SessionRenamePorts, SessionRenameInput, { output: string }>('session.rename', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the conversation to rename was not one the app could read' },
  async run(ports, input) {
    const target = targetOf(ports, input);
    if ('refused' in target) return target;
    const { sessionId, title, folder } = target;
    // The drawer's refusals: an empty name, a row that is gone. A /rename of a conversation the drawer
    // has no row for has no label there to change, and goes on to its title.
    const refused = ports.relabel(sessionId, title);
    if (refused !== null && !('slot' in input)) return { refused };
    try {
      await ports.retitle(sessionId, title, folder);
    } catch (error) {
      // Say what took the name and what did not: a row that has it, or nothing at all.
      if (refused !== null) return { refused: `Could not rename to ${title}: ${failureText(error)}` };
      return { refused: `Renamed to ${title} in the drawer, but /resume still lists it by its old name: ${failureText(error)}` };
    }
    return { output: `Renamed to ${title}.` };
  },
});
