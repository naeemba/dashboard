import type { Refused } from '../../shared/app/bridge';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { paneFromId, terminalId } from '../../shared/panes/terminals';
import { PANE_ID } from '../workers/session-cli';

// Why a request names no pane this app has open.
export const notOpen = (pane: string): Refused => ({ refused: `pane ${pane} is not open in this app` });

// The pane a request from a shell is for, as this run numbers it: its place in the project it was
// opened in. A shell the pane host kept through a restart still sends the id it was spawned with,
// which names another project's pane once a project closed before the restart has moved the ones
// after it. The manager's page never moves. The browser door and the session door both read it.
export function livePane(ports: { slotOf(projectPath: string): number }, sent: string, paneProject: string): string | Refused {
  if (!PANE_ID.test(sent)) return notOpen(sent);
  const { slot, index } = paneFromId(sent);
  if (slot === MANAGER_SLOT) return sent;
  const live = ports.slotOf(paneProject);
  return live === -1 ? { refused: `pane ${sent} is of ${paneProject}, which is not open in this app` } : terminalId(live, index);
}
