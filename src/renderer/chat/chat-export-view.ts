import type { DashboardBridge } from '../../shared/app/bridge';
import { conversationText, exportFileName, exportRows } from './chat-export';
import type { ChatEntry } from '../../shared/chat/chat-transcript';
import type { Say } from './chat-screen-commands';
import { failureText } from '../../shared/errors/failure';
import { searchOverlay } from '../app/overlay';

// /export's sheet: copy the conversation to the clipboard or save it to a file, or, with a name typed
// after the command, straight to that file. Resolves once it is done or given up on.
export async function exportConversation(
  bridge: DashboardBridge, slot: number, say: Say, entries: ChatEntry[], name: string,
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
    if (picked === 'file') {
      const written = await bridge.chatExport(slot, exportFileName(name, entries, new Date()), text);
      say.onNotice('path' in written ? `Conversation saved to ${written.path}` : `Conversation not exported: ${written.refused}`);
    }
  } catch (error) {
    say.onError(`Conversation not exported: ${failureText(error)}`);
  }
}
