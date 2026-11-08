import type { Release } from '../../../shared/app/update';
import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';
import type { UpdateStatePorts } from './check';

// The staged release checked, then the quit asked for with the update armed. Only ever on the person
// picking the row: nothing restarts the app on its own (updates-rule-1). The swap and the relaunch wait
// for the quit question's Quit (update-actions.ts), so a Cancel leaves the install and the next quit as
// they were, and Restart can be picked again.

export type UpdateRestartPorts = UpdateStatePorts & {
  // Throws when the staged app is not the release, before anything is asked.
  verify(release: Release): Promise<void>;
  // The update armed for a confirmed quit, and the quit asked for.
  quit(release: Release): void;
};

export const updateRestart = action<UpdateRestartPorts, Record<string, never>, { output: string }>('update.restart', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const current = ports.state();
    if (current.kind !== 'staged') return { refused: 'no update is downloaded to restart into' };
    try {
      await ports.verify(current.release);
    } catch (error: unknown) {
      ports.set({ ...current, failure: `Not installed: ${failureText(error)}` });
      throw error;
    }
    ports.quit(current.release);
    return { output: `restarting into v${current.release.version}` };
  },
});
