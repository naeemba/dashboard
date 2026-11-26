import { action } from '../action';
import { isSlot } from '../pane/pane-input';
import { WORKER_KEEPS_ITS_CONVERSATION, type SlotConversation } from '../../chat/slot-conversation';
import type { ConversationPorts } from './conversation-ports';

// /branch: the conversation is copied into a new one and the page goes on in the copy the way /resume
// goes on in a picked one, so the original is left as it was and stays in /resume's list. A rewind not
// yet carried on is kept: the copy stops at its cut.

export type SessionBranchPorts = ConversationPorts & {
  // `from`'s live conversation copied, up to `cutAt` when given, and the page or screen going on in the copy.
  fork(slot: number, projectPath: string, from: SlotConversation, cutAt: string | undefined, title: string): Promise<void>;
};

// Why /branch is refused before the page has a conversation to copy.
const NOTHING_TO_BRANCH = 'Nothing to branch yet: send a prompt first.';

export const sessionBranch = action<SessionBranchPorts, { slot: number; title: string }, { output: string }>('session.branch', {
  words: [],
  input: ({ slot, title }) => (
    isSlot(slot) && typeof title === 'string' ? { slot, title } : { refused: 'the conversation to branch was not one the app could read' }
  ),
  async run(ports, { slot, title }) {
    const conversation = ports.conversation(slot);
    if (conversation.keeps) return { refused: WORKER_KEEPS_ITS_CONVERSATION };
    const projectPath = ports.projectPath(slot);
    if (projectPath === undefined || conversation.live === undefined) return { refused: NOTHING_TO_BRANCH };
    await ports.fork(slot, projectPath, conversation, conversation.cut, title);
    return { output: `branched ${conversation.live}` };
  },
});
