import type { SavedSession, Session } from './session';
import { TERMINAL_COUNT, terminalId } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// Which Claude Code conversation each pane was running, and how a launch gets it back.
//
// The token sweep places every live session on its pane; this turns that into what session.json keeps
// per pane, and back into the line typed into a pane's new shell. A session is resumed from the folder
// it ran in because `claude --resume <id>` looks the id up under the folder it is run from: a session
// started in a worktree pane is not found from the project's own checkout.
export type PaneConversation = { session: string; directory: string };

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
// project's. Only the two fields a resume needs are copied: the live reading carries the pid as well.
export function withClaude(
  layout: Session,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, PaneConversation>,
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

// What session.json should now say, or null when nothing is to be written. Nothing until the renderer
// has sent a layout: before that there is no list of pages to put the sessions on, and writing the
// saved file back would be writing yesterday. A write that says what the last one said is skipped too.
export function sessionToWrite(
  layout: Session | null,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, PaneConversation>,
  lastWritten: string,
): { session: SavedSession; encoded: string } | null {
  if (layout === null) return null;
  const session = withClaude(layout, slotOf, held);
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
// process saw it and a project opened through a symlink does not. And it is in a pane of the card's
// own project, which is what a record's pane number counts in, with no pane given the card yet: every
// record loses its pane at launch, so a second pane in the same worktree finds it taken and stays a
// shell, as it was started.
export function agentToResume(
  entries: readonly WorktreeEntry[],
  conversation: PaneConversation,
  projectPath: string,
  realPath: (path: string) => string,
): WorktreeEntry | undefined {
  const directory = realPath(conversation.directory);
  return entries.find((entry) => (
    entry.projectPath === projectPath && entry.pane === null && realPath(entry.worktreePath) === directory
  ));
}

// Typed into the pane's own shell rather than run as the pane's process, so exiting Claude leaves a
// prompt instead of a dead pane.
export function resumeLine(conversation: PaneConversation): string {
  return `claude --resume ${conversation.session}\r`;
}
