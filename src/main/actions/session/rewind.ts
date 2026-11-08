import type { RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import { isRecord } from '../../../shared/app/is-record';
import { conversationAfterRewind, type RewindChoice, type RewindPoint } from '../../../shared/chat/chat-rewind';
import { action } from '../action';
import { isFilledText, isSlot } from '../pane/pane-input';
import { keepsItsConversation, WORKER_KEEPS_ITS_CONVERSATION, type ConversationPorts } from './conversation-ports';

// A prompt picked in /rewind. The code goes back first, counted by a dry run, and a rewind that cannot
// put it back leaves the conversation alone too. The conversation goes back by closing the session and
// starting one that resumes up to the message before the prompt; before the first one there is nothing
// to resume, which is a new conversation.

export type SessionRewindPorts = ConversationPorts & {
  // The files the session changed since `pointId` put back, or with `dryRun` only counted. Starts the
  // session if it has ended, since only a running one can rewind.
  rewindFiles(slot: number, projectPath: string, pointId: string, dryRun: boolean): Promise<RewindFilesResult>;
};

type SessionRewindInput = { slot: number; point: RewindPoint; choice: RewindChoice };

function read(raw: Record<string, unknown>): SessionRewindInput | null {
  const { slot, point, choice } = raw;
  if (!isSlot(slot) || !isRecord(point) || !isRecord(choice) || !isFilledText(point.id)) return null;
  if (!(point.before === null || typeof point.before === 'string')) return null;
  if (typeof choice.code !== 'boolean' || typeof choice.conversation !== 'boolean') return null;
  return { slot, point: point as RewindPoint, choice: choice as RewindChoice };
}

export const sessionRewind = action<SessionRewindPorts, SessionRewindInput, { output: string; restored: RewindFilesResult | null }>('session.rewind', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the prompt to rewind to was not one the app could read' },
  async run(ports, { slot, point, choice }) {
    const projectPath = ports.projectPath(slot);
    const worker = ports.worker(slot);
    if (keepsItsConversation(worker)) return { refused: WORKER_KEEPS_ITS_CONVERSATION };
    if (projectPath === undefined) return { refused: 'the page has no project to rewind' };
    let restored: RewindFilesResult | null = null;
    if (choice.code) {
      const preview = await ports.rewindFiles(slot, projectPath, point.id, true);
      restored = preview.canRewind ? { ...preview, ...(await ports.rewindFiles(slot, projectPath, point.id, false)) } : preview;
    }
    const conversationRewind = conversationAfterRewind(point, choice, restored);
    if (conversationRewind !== 'keep') {
      await ports.change(slot, projectPath, worker, conversationRewind === 'forget' ? undefined : { cutAt: conversationRewind.cutAt });
    }
    return { output: `rewound to ${point.id}`, restored };
  },
});
