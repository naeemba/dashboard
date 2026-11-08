import type { Refused } from '../../../shared/app/bridge';
import type { Release, UpdateState } from '../../../shared/app/update';
import { isNewer, readRelease } from '../../update/release';
import { action } from '../action';

// The newest release read off GitHub, and a notice if it is newer than this build and this machine can
// install it. A machine that cannot (a development run, a platform the release has no download for) is
// told why instead of being offered an Update that would fail. One already downloading or downloaded is
// left alone: the release it found is the one being installed. Whether the schedule asks at all is the
// settings row's, decided where the schedule runs (update-actions.ts).

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
  // Why this machine cannot install `release`, or null when it can.
  refusal(release: Release): Refused | null;
};

export const updateCheck = action<UpdateCheckPorts, Record<string, never>, { output: string }>('update.check', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const current = ports.state();
    if (current.kind === 'downloading' || current.kind === 'staged') return { output: `v${current.release.version} is already on its way` };
    const release = readRelease(await ports.latest());
    if (release === null) throw new Error('GitHub answered with no release the app could read');
    if (!isNewer(release.version, ports.running)) {
      ports.set({ kind: 'none' });
      return { output: `v${ports.running} is the newest release` };
    }
    const refusal = ports.refusal(release);
    if (refusal !== null) return refusal;
    ports.set({ kind: 'available', release });
    return { output: `v${release.version} is out` };
  },
});
