import { EDITOR_INDEX } from '../../shared/panes/terminals';
import { agentToResume, type PaneConversation } from '../workers/claude-resume';
import { paneOfKey, type Survivor } from './pane-host-protocol';
import type { PaneCommand } from '../../shared/panes/pane-reading';
import type { WorktreeEntry } from '../../shared/app/bridge';

// What a shell the pane host kept through a restart comes back as, once its project is open again.
// The pane is the same pane: what it runs and where, as it was spawned. A card's agent still running
// in it names the pane on the card's record again, the way a resumed one does (agentToResume), and a
// worker main dispatched is main's again. The conversation saved for the pane is taken all the same,
// so it is not resumed a second time in a pane beside the one it is still running in.
//
// The editor is not kept, and answers nothing: nvim listens on a socket named after the app's pid and
// the project's page (nvim-remote.ts), both of which a restart changes, so the app could not reach it.
// It is killed and starts fresh on its key, as it did before the host.
export type AdoptedPane = { command: PaneCommand; card: WorktreeEntry | undefined; worker: boolean };

export function adoptedPane(
  survivor: Survivor,
  saved: PaneConversation | null,
  entries: readonly WorktreeEntry[],
  panesBeforeLaunch: ReadonlyMap<string, number>,
  realPath: (path: string) => string,
): AdoptedPane | undefined {
  const { projectPath, index } = paneOfKey(survivor.key);
  if (index === EDITOR_INDEX) return undefined;
  const conversation = saved ?? { session: '', directory: survivor.cwd };
  return {
    command: { args: survivor.args, directory: survivor.cwd },
    card: agentToResume(entries, panesBeforeLaunch, conversation, projectPath, index, realPath),
    worker: saved?.dispatched === true,
  };
}
