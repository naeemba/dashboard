import type { SavedSession, Session } from './session';
import { TERMINAL_COUNT, terminalId } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// Which Claude Code conversation each pane was running, and how a launch gets it back.
//
// The token sweep places every live session on its pane; this turns that into what session.json keeps
// per pane, and back into the line typed into a pane's new shell. A session is resumed from the folder
// it ran in because `claude --resume <id>` looks the id up under the folder it is run from: a session
// started in a worktree pane is not found from the project's own checkout.
export type ClaudeSlot = { session: string; directory: string };

// How long after a pane is resumed it keeps its saved session without a live reading behind it. A
// resumed Claude takes a moment to write ~/.claude/sessions/<pid>.json and the first sweep runs three
// seconds into the launch, so without this the first write after a launch would save every pane as
// empty and a crash then would lose all of them. Measured to when a reading was taken, not when it
// arrived: resume-ledger.ts holds why.
export const RESUME_GRACE_MS = 30_000;

// The id is typed into a shell, so it is held to the shape Claude Code gives it. Anything else in a
// hand-edited or damaged file would be a command run in the pane.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClaudeSlot(value: unknown): value is ClaudeSlot {
  const { session, directory } = (value ?? {}) as { session?: unknown; directory?: unknown };
  return typeof session === 'string' && SESSION_ID.test(session)
    && typeof directory === 'string' && directory !== '';
}

// What each pane counts as running, by terminal id. For a reading taken inside the grace a pane that
// was resumed keeps its saved slot unless the reading says otherwise; after it, only the reading counts,
// so a Claude you exited after the restart does not come back on the launch after.
export function heldSlots(
  live: ReadonlyMap<string, ClaudeSlot>,
  resumed: ReadonlyMap<string, ClaudeSlot>,
  sinceResume: number,
): ReadonlyMap<string, ClaudeSlot> {
  return sinceResume >= RESUME_GRACE_MS ? live : new Map([...resumed, ...live]);
}

// The renderer's layout with each page's panes filled in. A page is matched to its slot by path, the
// way the restore matches them, and a page with no open slot gets no sessions rather than another
// project's. Only the two fields a resume needs are copied: the live reading carries the pid as well.
export function withClaude(
  layout: Session,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, ClaudeSlot>,
): SavedSession {
  return {
    ...layout,
    pages: layout.pages.map((page) => {
      const slot = slotOf(page.path);
      if (slot === -1) return { ...page, claude: [] };
      const claude = Array.from({ length: TERMINAL_COUNT }, (_value, index) => {
        const found = held.get(terminalId(slot, index));
        return found === undefined ? null : { session: found.session, directory: found.directory };
      });
      return { ...page, claude };
    }),
  };
}

// A slot is resumed only from a folder that is still there. A worktree removed while the app was closed
// would only print "No conversation found", so that pane gets the plain shell at the project instead.
export function resumable(
  slot: ClaudeSlot | null | undefined,
  exists: (directory: string) => boolean,
): slot is ClaudeSlot {
  return slot !== null && slot !== undefined && exists(slot.directory);
}

// The card whose worktree a session ran in, if any. That session was the card's agent, and it comes
// back as the agent: the record names the pane again, so the status bar prints the branch, a second
// ship of the card is refused, and the review sweep waits for it rather than starting beside it.
export function cardResumedIn(
  entries: readonly WorktreeEntry[],
  projectPath: string,
  slot: ClaudeSlot,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.projectPath === projectPath && entry.worktreePath === slot.directory);
}

// Typed into the pane's own shell rather than run as the pane's process, so exiting Claude leaves a
// prompt instead of a dead pane.
export function resumeLine(slot: ClaudeSlot): string {
  return `claude --resume ${slot.session}\r`;
}
