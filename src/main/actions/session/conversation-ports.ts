import type { ScreenSession } from '../../chat/chat-sessions';

// What session.reset, .resume, .branch and .rewind ask of the page's session, which chat-sessions.ts
// holds: the session itself, the conversation it remembers and a rewind's pending cut.

export type ConversationPorts = {
  // The folder the session runs in: the page's project, or a worker screen's own folder.
  projectPath(slot: number): string | undefined;
  // The worker screen running under this key, or undefined for a page's main.
  worker(slot: number): ScreenSession | undefined;
  // The page's session closed, for a page with no folder to start one in again.
  stop(slot: number): void;
  // The page, or the screen `worker` names, goes on in another conversation: the id, undefined for a
  // new one, or a cut. `worker` is the one read before any await (nextConversation).
  change(slot: number, projectPath: string, worker: ScreenSession | undefined, next: string | undefined | { cutAt: string }): Promise<void>;
};

// Why /clear, /resume, /branch and /rewind are refused on main's worker screen, which keeps the
// conversation the app started it on (workers-decision-7). A screen opened by hand is yours and takes
// all four. /rewind's list of prompts asks it too, so the refusal comes before either sheet opens.
export const keepsItsConversation = (worker: Pick<ScreenSession, 'owner'> | undefined): boolean => worker?.owner === 'main';

export const WORKER_KEEPS_ITS_CONVERSATION = 'A worker screen stays on the conversation it was started on.';
