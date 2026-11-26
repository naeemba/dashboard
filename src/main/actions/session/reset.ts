import { action } from '../action';
import { isSlot } from '../pane/pane-input';
import { WORKER_KEEPS_ITS_CONVERSATION } from '../../chat/slot-conversation';
import type { ConversationPorts } from './conversation-ports';

// /clear: a new conversation. The running one is closed, the page forgets its id (a screen opened by
// hand saves a new one of its own), and a fresh session starts at once, so a worker's report still has
// a main to arrive at. The old transcript stays on disk for whatever lists sessions later.

export const sessionReset = action<ConversationPorts, { slot: number }, { output: string }>('session.reset', {
  words: [],
  input: ({ slot }) => (isSlot(slot) ? { slot } : { refused: 'the page to clear was not one the app could read' }),
  async run(ports, { slot }) {
    const conversation = ports.conversation(slot);
    if (conversation.keeps) return { refused: WORKER_KEEPS_ITS_CONVERSATION };
    const projectPath = ports.projectPath(slot);
    if (projectPath === undefined) ports.stop(slot);
    else await ports.change(slot, projectPath, conversation, undefined);
    return { output: 'a new conversation' };
  },
});
