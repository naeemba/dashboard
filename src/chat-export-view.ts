import type { DashboardBridge } from './bridge';
import { conversationText, exportFileName, exportRows } from './chat-export';
import type { ChatEntry } from './chat-transcript';
import type { ChatViewOptions } from './chat-view';
import { failureText } from './failure';
import { searchOverlay } from './overlay';

// /export's sheet: copy the conversation to the clipboard or save it to a file, or, with a name typed
// after the command, straight to that file. Resolves once it is done or given up on.
export async function exportConversation(
  bridge: DashboardBridge, slot: number, say: Pick<ChatViewOptions, 'onError' | 'onNotice'>, entries: ChatEntry[], name: string,
): Promise<void> {
  const text = conversationText(entries);
  if (text.trim() === '') return say.onNotice('Nothing to export yet.');
  const picked = name ? 'file' : await searchOverlay({
    name: 'chat-export', placeholder: 'Export the conversation', rows: exportRows, empty: 'No choice matches.', glyph: () => 'claude',
  });
  try {
    if (picked === 'clipboard') {
      await navigator.clipboard.writeText(text);
      say.onNotice('Conversation copied to the clipboard.');
    }
    if (picked === 'file') say.onNotice(`Conversation saved to ${await bridge.chatExport(slot, exportFileName(name, entries, new Date()), text)}`);
  } catch (error) {
    say.onError(`Conversation not exported: ${failureText(error)}`);
  }
}
