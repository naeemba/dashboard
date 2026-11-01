import type { DashboardBridge } from './bridge';
import type { ChatViewOptions } from './chat-view';
import { failureText } from './failure';

// /rename on the Claude screen. Claude Code names a conversation with it; the Agent SDK writes the
// name into the conversation's file, where the summary /resume lists reads it first. The screen sends
// the name to main, which decides here what may be renamed and does it.

// What `/rename x` renames: the conversation /resume marks as the page's, to the name typed. Refused
// with no name, and with no conversation yet or a rewind waiting on its next prompt, which starts a new
// one and would leave the name on the old.
export function renameTarget(current: string | null, title: string): { sessionId: string; title: string } | { refused: string } {
  if (!title) return { refused: 'Name the conversation: /rename <name>.' };
  if (current === null) return { refused: 'No conversation to rename yet. Send a prompt first.' };
  return { sessionId: current, title };
}

// The screen's half: main's refusal, or that it was renamed, as a notice.
export function renameConversation(
  bridge: DashboardBridge, slot: number, title: string, say: Pick<ChatViewOptions, 'onError' | 'onNotice'>,
): void {
  bridge.chatRename(slot, title).then(
    (refused) => say.onNotice(refused ?? `Renamed to ${title}.`),
    (error: unknown) => say.onError(`Not renamed: ${failureText(error)}`),
  );
}
