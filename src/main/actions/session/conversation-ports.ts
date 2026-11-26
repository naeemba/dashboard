import type { SlotConversation } from '../../chat/slot-conversation';

// What session.reset, .resume, .branch and .rewind ask of the page's session, which chat-sessions.ts
// holds. Where a page's main and a worker screen differ is the slot's conversation
// (chat/slot-conversation.ts), so none of the four asks which one it is.

export type ConversationPorts = {
  // The folder the session runs in: the page's project, or a worker screen's own folder.
  projectPath(slot: number): string | undefined;
  // The slot's conversation as it stands now.
  conversation(slot: number): SlotConversation;
  // The page's session closed, for a page with no folder to start one in again.
  stop(slot: number): void;
  // The page, or the screen `from` was read for, goes on in another conversation: the id, undefined
  // for a new one, or a cut. `from` is the one read before any await (nextConversation).
  change(slot: number, projectPath: string, from: SlotConversation, next: string | undefined | { cutAt: string }): Promise<void>;
};
