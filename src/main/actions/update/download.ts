import type { Release, UpdateState } from '../../../shared/app/update';
import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';
import type { UpdateStatePorts } from './check';

// The release's download for this machine, its size checked and staged beside the install, then
// "Restart to update". A failure is said on the dialog and thrown, so the screen logs it; the release
// stays available for another try.

export type UpdateDownloadPorts = UpdateStatePorts & {
  // Downloaded, verified and staged. A machine that cannot install the release was refused by the check.
  stage(release: Release): Promise<void>;
};

function refusal(state: Exclude<UpdateState, { kind: 'available' }>): string {
  if (state.kind === 'downloading') return `v${state.release.version} is already downloading`;
  if (state.kind === 'staged') return `v${state.release.version} is already downloaded: restart to update`;
  return 'there is no newer release to download';
}

export const updateDownload = action<UpdateDownloadPorts, Record<string, never>, { output: string }>('update.download', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const current = ports.state();
    if (current.kind !== 'available') return { refused: refusal(current) };
    const { release } = current;
    ports.set({ kind: 'downloading', release });
    try {
      await ports.stage(release);
    } catch (error: unknown) {
      ports.set({ kind: 'available', release, failure: `Not downloaded: ${failureText(error)}` });
      throw error;
    }
    ports.set({ kind: 'staged', release });
    return { output: `v${release.version} is ready: restart to update` };
  },
});
