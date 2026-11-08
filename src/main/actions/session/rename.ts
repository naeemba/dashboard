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
  folderOf(slot: number): string | undefined;
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

export const sessionRename = action<SessionRenamePorts, SessionRenameInput, { output: string }>('session.rename', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the conversation to rename was not one the app could read' },
  async run(ports, input) {
    if ('slot' in input) {
      // Refused with no name, and with no conversation yet or a rewind waiting on its next prompt.
      const target = renameTarget(ports.onScreen(input.slot), input.title);
      if ('refused' in target) return target;
      await ports.retitle(target.sessionId, target.title, ports.folderOf(input.slot));
      // A conversation the drawer has no row for has no label there to change.
      ports.relabel(target.sessionId, target.title);
      return { output: `Renamed to ${target.title}.` };
    }
    // The drawer's own refusals first: an empty name, a row that is gone.
    const refused = ports.relabel(input.id, input.label);
    if (refused !== null) return { refused };
    const title = input.label.trim();
    try {
      await ports.retitle(input.id, title, ports.directoryOf(input.id));
    } catch (error) {
      // The row has the name by now; say what did not, rather than read as nothing renamed.
      return { refused: `Renamed to ${title} here, but /resume still lists it by its old name: ${failureText(error)}` };
    }
    return { output: `Renamed to ${title}.` };
  },
});
