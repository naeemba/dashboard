import type { LogDraft } from '../../../shared/app/log-entry';
import type { Release } from '../../../shared/app/update';
import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';

// What the quit question's answer does to an update update.restart armed. Quit swaps it in and opens the
// app again; anything else (Cancel, a dialog that failed) forgets it, so the next quit the person
// confirms is only a quit (updates-rule-1). A swap that fails leaves the install as it was (swapInto),
// and the app quits as asked, unrestarted. Called by the window, never by a channel or the command.

export type UpdateInstallPorts = {
  armed(): Release | null;
  disarm(): void;
  swap(release: Release): Promise<void>;
  // Inside a quit already under way.
  relaunch(): void;
  log(draft: LogDraft): void;
};

export const updateInstall = action<UpdateInstallPorts, { quit: boolean }, { output: string }>('update.install', {
  words: [],
  input: (raw) => ({ quit: raw.quit === true }),
  async run(ports, { quit }) {
    const release = ports.armed();
    ports.disarm();
    if (release === null) return { refused: 'no update is waiting for this quit' };
    if (!quit) return { output: `v${release.version} is not installed: the quit was cancelled` };
    try {
      await ports.swap(release);
    } catch (error: unknown) {
      const message = `update not installed: ${failureText(error)}`;
      ports.log({ level: 'warn', kind: 'app', message });
      return { output: message };
    }
    const message = `restarting into v${release.version}`;
    ports.log({ level: 'info', kind: 'app', message });
    ports.relaunch();
    return { output: message };
  },
});
