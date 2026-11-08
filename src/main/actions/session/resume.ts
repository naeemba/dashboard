import type { ScreenSession } from '../../chat/chat-sessions';
import { stillRunning } from '../../workers/session-index';
import { action } from '../action';
import { isFilledText, isSlot } from '../pane/pane-input';
import { keepsItsConversation, WORKER_KEEPS_ITS_CONVERSATION, type ConversationPorts } from './conversation-ports';

// An earlier conversation picked in /resume: the running one is closed, the page (or a screen opened
// by hand) goes on in the picked one, and a session resuming it starts at once. One a worker pane runs
// is refused, as the drawer refuses one the Claude screen runs, and so is main's on a screen opened by
// hand.

export type SessionResumePorts = ConversationPorts & {
  // The worker pane running a conversation now, as a person names it, or null.
  runningInPane(sessionId: string): string | null;
  // The conversation the project's main remembers.
  mainsConversation(projectPath: string): string | undefined;
};

// Where a conversation /resume picked runs now, or null: a worker pane, or for a screen opened by hand
// in the project's folder, main, whose conversations its /resume lists too.
export function runningElsewhere(
  sessionId: string, paneRunningIt: string | null, worker: ScreenSession | undefined, mainsConversation: string | undefined,
): string | null {
  if (paneRunningIt !== null) return paneRunningIt;
  return worker !== undefined && sessionId === mainsConversation ? 'main' : null;
}

export const sessionResume = action<SessionResumePorts, { slot: number; sessionId: string }, { output: string }>('session.resume', {
  words: [],
  input: ({ slot, sessionId }) => (
    isSlot(slot) && isFilledText(sessionId) ? { slot, sessionId } : { refused: 'the conversation to resume was not one the app could read' }
  ),
  async run(ports, { slot, sessionId }) {
    const projectPath = ports.projectPath(slot);
    if (projectPath === undefined) return { output: 'the page has no project to resume in' };
    const worker = ports.worker(slot);
    if (keepsItsConversation(worker)) return { refused: WORKER_KEEPS_ITS_CONVERSATION };
    const elsewhere = runningElsewhere(sessionId, ports.runningInPane(sessionId), worker, ports.mainsConversation(projectPath));
    const refused = stillRunning(undefined, elsewhere);
    if (refused !== null) return { refused };
    await ports.change(slot, projectPath, worker, sessionId);
    return { output: `resumed ${sessionId}` };
  },
});
