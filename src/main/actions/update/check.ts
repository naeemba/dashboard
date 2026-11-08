import type { Refused } from '../../../shared/app/bridge';
import type { Release, UpdateState } from '../../../shared/app/update';
import { isNewer, readRelease } from '../../update/release';
import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';

// The newest release read off GitHub, and a notice if it is newer than this build and this machine can
// install it. A machine that cannot (a development run, a platform the release has no download for) is
// told why instead of being offered an Update that would fail. One already downloading or downloaded is
// left alone, before the ask and again after it: Update picked while GitHub was answering has already
// started the download, and putting it back to available would offer a second one over the first.
// Whether the schedule asks at all is the settings row's (scheduledCheck).

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

function onItsWay(state: UpdateState): { output: string } | null {
  return state.kind === 'downloading' || state.kind === 'staged' ? { output: `v${state.release.version} is already on its way` } : null;
}

export const updateCheck = action<UpdateCheckPorts, Record<string, never>, { output: string }>('update.check', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const before = onItsWay(ports.state());
    if (before !== null) return before;
    const release = readRelease(await ports.latest());
    const after = onItsWay(ports.state());
    if (after !== null) return after;
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

// The launch and six-hourly check: nothing asked while the settings row is off, and a failure is a line
// in the log, nothing on screen.
export function scheduledCheck(enabled: () => boolean, check: () => Promise<unknown>, warn: (message: string) => void): () => void {
  return () => {
    if (!enabled()) return;
    check().catch((error: unknown) => warn(`update check failed: ${failureText(error)}`));
  };
}
