import type { OpenProjects } from '../../shared/app/bridge';
import type { Channels } from '../app/channels';
import { terminalId } from '../../shared/panes/terminals';
import type { PaneActions } from '../actions/pane/pane-actions';

// The new-pane and close-pane channels: doors of pane.open and pane.close, which decide.
export function registerWorkerChannels(table: Channels, main: Pick<PaneActions, 'open' | 'close'> & {
  openProjects(): OpenProjects;
}): void {
  // The two keys and the two halves of the button above the worker list: a shell, or with `claude` a
  // Claude screen waiting for its first prompt. A refusal (a project with no folder) answers null, as
  // the screen has nothing to land on.
  table.handle('pane:add', async (_screen, slot: number, claude = false) => {
    const opened = await main.open.call({ slot, claude });
    return 'refused' in opened ? null : { index: opened.index, open: main.openProjects() };
  });
  // The close key and a worker's close button. The screen only closes a pane it shows, so a refusal has
  // nobody to tell.
  table.handle('pane:close', async (_screen, slot: number, index: number) => {
    await main.close.call({ id: terminalId(slot, index) });
  });
}
