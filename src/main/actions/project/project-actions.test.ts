import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { channels } from '../../app/channels';
import type { Refused } from '../../../shared/app/bridge';
import { temporaryFolder } from '../../testing/temporary-folder';
import { registerProjectChannels, type ProjectActions } from './project-actions';

const listed = { projects: [], panes: [] };
const folder = temporaryFolder('dashboard-projects-open-');

// A refusal comes back as a value: a throw would reach the screen behind Electron's "Error invoking
// remote method 'projects:open'" prefix (errors-rule-2).
function setUp(chosen: string | null | Refused = null, opened: { output: string; index: number } | Refused = { output: 'opened', index: 3 }) {
  const table = channels();
  const call = vi.fn(async () => opened);
  const chooseFolder = vi.fn(async () => chosen);
  registerProjectChannels(table, { open: { call } } as unknown as ProjectActions, { chooseFolder, openProjects: () => listed });
  const open = (screen: string, projectPath: string | null) => table.invoke(screen, 'projects:open', [projectPath]);
  return { open, call, chooseFolder };
}

describe('projects:open', () => {
  it('answers the dialog\'s refusal and its cancel, opening nothing', async () => {
    const refusing = setUp({ refused: "Type the folder's path on the host" });
    await expect(refusing.open('mac', null)).resolves.toEqual({ refused: "Type the folder's path on the host" });
    expect(refusing.chooseFolder).toHaveBeenCalledWith('mac');
    const cancelled = setUp(null);
    await expect(cancelled.open('local', null)).resolves.toBeNull();
    expect(refusing.call).not.toHaveBeenCalled();
    expect(cancelled.call).not.toHaveBeenCalled();
  });

  it('answers a typed path that names no folder, opening nothing', async () => {
    const { open, call } = setUp();
    await expect(open('mac', 'relative/path')).resolves.toEqual({ refused: 'No folder at relative/path' });
    const gone = join(folder, 'gone');
    await expect(open('mac', gone)).resolves.toEqual({ refused: `No folder at ${gone}` });
    expect(call).not.toHaveBeenCalled();
  });

  it('answers the action\'s refusal, and the slot and list once it opens', async () => {
    await expect(setUp(null, { refused: 'not ready' }).open('local', folder)).resolves.toEqual({ refused: 'not ready' });
    const { open, call, chooseFolder } = setUp();
    await expect(open('local', folder)).resolves.toEqual({ index: 3, open: listed });
    expect(chooseFolder).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ projectPath: folder, from: 'picker' }));
  });
});
