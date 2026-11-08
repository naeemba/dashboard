import type { UpdateState } from '../../../shared/app/update';
import { isNewer, readRelease } from '../../update/release';
import { action } from '../action';

// The newest release read off GitHub, and a notice if it is newer than this build. The schedule's check
// (`asked` false) does nothing while the settings row has it off; the dialog's key asks anyway. One
// already downloading or downloaded is left alone: the release it found is the one being installed.

export type UpdateStatePorts = {
  state(): UpdateState;
  // The state kept, and the window told.
  set(next: UpdateState): void;
};

export type UpdateCheckPorts = UpdateStatePorts & {
  // GitHub's answer, parsed JSON. Throws when GitHub cannot be reached or answers an error.
  latest(): Promise<unknown>;
  // This build's stamp, `<version>+<commit>`.
  running: string;
  enabled(): boolean;
};

export const updateCheck = action<UpdateCheckPorts, { asked: boolean }, { output: string }>('update.check', {
  words: [],
  input: ({ asked }) => ({ asked: asked === true }),
  async run(ports, { asked }) {
    if (!asked && !ports.enabled()) return { output: 'the update check is off' };
    const current = ports.state();
    if (current.kind === 'downloading' || current.kind === 'staged') return { output: `v${current.release.version} is already on its way` };
    const release = readRelease(await ports.latest());
    if (release === null) throw new Error('GitHub answered with no release the app could read');
    if (!isNewer(release.version, ports.running)) {
      ports.set({ kind: 'none' });
      return { output: `v${ports.running} is the newest release` };
    }
    ports.set({ kind: 'available', release });
    return { output: `v${release.version} is out` };
  },
});
