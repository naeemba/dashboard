import type { SavedSession, Session } from './session';
import { isWorker, paneFromId } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// Which Claude Code conversation each pane was running, and how a launch gets it back.
//
// The token sweep places every live session on its pane; this turns that into what session.json keeps
// per pane, and back into the line typed into a pane's new shell. A session is resumed from the folder
// it ran in because `claude --resume <id>` looks the id up under the folder it is run from: a session
// started in a worktree pane is not found from the project's own checkout.
//
// `dispatched` marks a worker main's `session run` started, the only kind main may release, so it comes
// back as main's after a restart and no other conversation does.
export type PaneConversation = { session: string; directory: string; dispatched?: boolean };

// The id is typed into a shell, so it is held to the shape Claude Code gives it. Anything else in a
// hand-edited or damaged file would be a command run in the pane.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPaneConversation(value: unknown): value is PaneConversation {
  const { session, directory } = (value ?? {}) as { session?: unknown; directory?: unknown };
  return typeof session === 'string' && SESSION_ID.test(session)
    && typeof directory === 'string' && directory !== '';
}

// The renderer's layout with each page's panes filled in. A page is matched to its slot by path, the
// way the restore matches them, and a page with no open slot gets no sessions rather than another
// project's. Only the fields a resume needs are copied: the live reading carries the pid as well.
// The list runs to the highest-numbered terminal holding one, since workers have no fixed count.
// `dispatched` says which panes hold main's worker now, which only main knows. Workers only: the
// editor runs nvim, and main is the Claude screen, which keeps its own conversation. Pane 0's saved one
// is taken once, on the launch that hands the terminal main over, and written back it would be handed
// over again on the next, over whatever main has moved on to.
export function withClaude(
  layout: Session,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, PaneConversation>,
  dispatched: (id: string) => boolean,
): SavedSession {
  return {
    ...layout,
    pages: layout.pages.map((page) => {
      const slot = slotOf(page.path);
      if (slot === -1) return { ...page, claude: [] };
      const claude: (PaneConversation | null)[] = [];
      for (const [id, found] of held) {
        const pane = paneFromId(id);
        if (pane.slot !== slot || !isWorker(pane.index)) continue;
        while (claude.length <= pane.index) claude.push(null);
        claude[pane.index] = { session: found.session, directory: found.directory, ...(dispatched(id) ? { dispatched: true } : {}) };
      }
      return { ...page, claude };
    }),
  };
}

// What session.json should now say, or null when nothing is to be written. Nothing until the renderer
// has sent a layout: before that there is no list of pages to put the sessions on, and writing the
// saved file back would be writing yesterday. A write that says what the last one said is skipped too.
export function sessionToWrite(
  layout: Session | null,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, PaneConversation>,
  dispatched: (id: string) => boolean,
  lastWritten: string,
): { session: SavedSession; encoded: string } | null {
  if (layout === null) return null;
  const session = withClaude(layout, slotOf, held, dispatched);
  const encoded = JSON.stringify(session);
  return encoded === lastWritten ? null : { session, encoded };
}

// A conversation is resumed only from a folder that is still there. A worktree removed while the app
// was closed would only print "No conversation found", so that pane gets the plain shell at the project
// instead.
export function resumable(
  conversation: PaneConversation | null | undefined,
  exists: (directory: string) => boolean,
): conversation is PaneConversation {
  return conversation !== null && conversation !== undefined && exists(conversation.directory);
}

// The card whose agent a resumed conversation was, or undefined when it comes back typed into a shell.
// It ran in the card's worktree, compared in real paths since Claude Code records the folder as the
// process saw it and a project opened through a symlink does not. And it is in the pane the card's
// record named when the app last ran, in the card's own project, which is what that number counts in.
// The pane is the one the records held before the launch cleared them, never whichever matching pane
// spawns first: a second Claude opened by hand in the same worktree, in a lower pane, would otherwise
// come back as the agent and leave the real one typed into a shell.
export function agentToResume(
  entries: readonly WorktreeEntry[],
  panesBeforeLaunch: ReadonlyMap<string, number>,
  conversation: PaneConversation,
  projectPath: string,
  index: number,
  realPath: (path: string) => string,
): WorktreeEntry | undefined {
  const directory = realPath(conversation.directory);
  return entries.find((entry) => (
    entry.projectPath === projectPath
    && panesBeforeLaunch.get(entry.cardId) === index
    && realPath(entry.worktreePath) === directory
  ));
}

// How a resumed conversation comes back. Main's worker comes back as main's worker, the pane's agent
// started the way a session run starts one, so its hooks report to the pane it is in now. A card's agent
// a ship started comes back as that agent. Anything else is typed into a shell, so exiting it leaves a
// prompt. A worker main ran on a card is both, and main's: the card's record names the pane either way.
export function resumedAs(conversation: PaneConversation, card: WorktreeEntry | undefined): 'worker' | 'agent' | 'shell' {
  if (conversation.dispatched === true) return 'worker';
  return card === undefined ? 'shell' : 'agent';
}

// What a project's saved first pane comes back as. Main resumes it when it ran in the project's
// checkout, compared in real paths for the reason agentToResume gives. Anything else was not main's: a
// session.json from before main existed held the first of five shells there, often a card's agent, and
// that one comes back in a worker rather than being dropped or handed to main.
export function mainResume(
  saved: PaneConversation | null,
  projectPath: string,
  realPath: (path: string) => string,
): { session?: string; worker?: PaneConversation } {
  if (saved === null) return {};
  return realPath(saved.directory) === realPath(projectPath) ? { session: saved.session } : { worker: saved };
}

// Typed into the pane's own shell rather than run as the pane's process, so exiting Claude leaves a
// prompt instead of a dead pane.
export function resumeLine(conversation: PaneConversation): string {
  return `claude --resume ${conversation.session}\r`;
}
