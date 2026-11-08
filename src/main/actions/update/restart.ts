import type { Release } from '../../../shared/app/update';
import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';
import type { UpdateStatePorts } from './check';

// The staged release swapped in and the app restarted into it. Only ever on the person picking the
// row: nothing restarts the app on its own (workflow-rule-1 is about agents; the person choosing is the
// point).

export type UpdateRestartPorts = UpdateStatePorts & {
  swap(release: Release): Promise<void>;
  relaunch(): void;
};

export const updateRestart = action<UpdateRestartPorts, Record<string, never>, { output: string }>('update.restart', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const current = ports.state();
    if (current.kind !== 'staged') return { refused: 'no update is downloaded to restart into' };
    try {
      await ports.swap(current.release);
    } catch (error: unknown) {
      ports.set({ ...current, failure: `Not installed: ${failureText(error)}` });
      throw error;
    }
    ports.relaunch();
    return { output: `restarting into v${current.release.version}` };
  },
});
