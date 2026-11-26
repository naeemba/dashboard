import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { resumeFrom } from '../../shared/chat/chat-rewind';
import type { ScreenSession } from './chat-sessions';

// One slot's conversation, read at one moment: what the session opens on, what is running, and who may
// move it. This is the one place a page's main and a worker screen differ here. A page's main keeps
// its conversation per project (chat-sessions.json) and holds a /rewind's cut until the next prompt.
// A worker screen keeps its own id (screen-workers.ts), never main's, though a worker in the project
// folder shares that folder with main. Reading main's for a worker would have /rename on a worker
// screen rename main's conversation.
export type SlotConversation = {
  // The worker screen this was read for, undefined for a page's main. A change made after an await
  // goes ahead only while it is still the slot's (nextConversation).
  screen: ScreenSession | undefined;
  // /clear, /resume, /branch and /rewind are refused: main's worker screen keeps the conversation the
  // app started it on (workers-decision-7). A screen opened by hand is yours and takes all four.
  // /rewind's list of prompts asks it too, so the refusal comes before either sheet opens.
  keeps: boolean;
  // The conversation running now: a screen's once its session has written it, or the page's
  // remembered one.
  live: string | undefined;
  // A /rewind's cut not yet carried on. Only a page's main holds one; a screen forks at once.
  cut: string | undefined;
  // Main's conversation, which /resume on a screen refuses as still running in main. Undefined on the
  // page itself, which is main.
  mains: string | undefined;
  // The page's main: its conversation is the project's, remembered for the next launch (forgotten
  // when its resume fails to start) and reported to the session index. A screen's is saved by
  // screen-workers.ts through carryOnIn, and touches neither.
  remembers: boolean;
  // What the session opens on. A screen resumes once its session has written the conversation, and
  // otherwise starts under the id the app chose. Swapped, a worker brought back after a restart starts
  // a new conversation, and a fresh one fails on an id already in use. The page resumes the remembered
  // one, up to a pending cut.
  opening: Pick<Options, 'resume' | 'sessionId' | 'resumeSessionAt' | 'forkSession'>;
};

export const WORKER_KEEPS_ITS_CONVERSATION = 'A worker screen stays on the conversation it was started on.';

export function slotConversation(
  screen: ScreenSession | undefined, remembered: string | undefined, cut: string | undefined,
): SlotConversation {
  if (screen === undefined) return { screen, keeps: false, live: remembered, cut, mains: undefined, remembers: true, opening: resumeFrom(remembered, cut) };
  return {
    screen,
    keeps: screen.owner === 'main',
    live: screen.resume ? screen.session : undefined,
    cut: undefined,
    mains: remembered,
    remembers: false,
    opening: screen.resume ? { resume: screen.session } : { sessionId: screen.session },
  };
}

// The conversation /resume marks as the slot's, or null with none yet or a cut pending: the page's on
// screen is not the remembered one then, so picking that one goes through chat:resume and puts it back
// whole.
export const onScreen = ({ live, cut }: SlotConversation): string | null => (cut === undefined ? live ?? null : null);
