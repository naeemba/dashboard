import type { ScreenSession } from '../../chat/chat-sessions';
import { action } from '../action';
import { isSlot } from '../pane/pane-input';
import { keepsItsConversation, WORKER_KEEPS_ITS_CONVERSATION, type ConversationPorts } from './conversation-ports';

// /branch: the conversation is copied into a new one and the page goes on in the copy the way /resume
// goes on in a picked one, so the original is left as it was and stays in /resume's list. A rewind not
// yet carried on is kept: the copy stops at its cut.

export type SessionBranchPorts = ConversationPorts & {
  // The conversation running under the key: a worker screen's own, or the page's remembered one.
  conversationOf(slot: number, projectPath: string): string | undefined;
  // The message a /rewind of the page's conversation resumes up to, until its next prompt.
  cutPending(projectPath: string): string | undefined;
  // `from` copied, up to `cutAt` when given, and the page or screen going on in the copy.
  fork(slot: number, projectPath: string, worker: ScreenSession | undefined, from: string, cutAt: string | undefined, title: string): Promise<void>;
};

// Why /branch is refused before the page has a conversation to copy.
const NOTHING_TO_BRANCH = 'Nothing to branch yet: send a prompt first.';

export const sessionBranch = action<SessionBranchPorts, { slot: number; title: string }, { output: string }>('session.branch', {
  words: [],
  input: ({ slot, title }) => (
    isSlot(slot) && typeof title === 'string' ? { slot, title } : { refused: 'the conversation to branch was not one the app could read' }
  ),
  async run(ports, { slot, title }) {
    const worker = ports.worker(slot);
    if (keepsItsConversation(worker)) return { refused: WORKER_KEEPS_ITS_CONVERSATION };
    const projectPath = ports.projectPath(slot);
    if (projectPath === undefined) return { refused: NOTHING_TO_BRANCH };
    const current = ports.conversationOf(slot, projectPath);
    if (current === undefined) return { refused: NOTHING_TO_BRANCH };
    await ports.fork(slot, projectPath, worker, current, worker ? undefined : ports.cutPending(projectPath), title);
    return { output: `branched ${current}` };
  },
});
