import { isRecord } from '../../../shared/app/is-record';
import type { Settings } from '../../../shared/settings/settings';
import { action } from '../action';

// The one writer of settings.json: the settings screen, launch's host token and a remote join saving the
// address it joined. Each change is kept as main's live copy with the shell it picks, then written.

export type SettingsWritePorts = {
  // The file, written privately and without this build's defaults (settings-store.ts).
  writeFile(settings: Settings): void;
  pickShell(settings: Settings): string;
  // Main's live copy, which every reader asks.
  keep(settings: Settings, shellCommand: string): void;
};

export const settingsWrite = action<SettingsWritePorts, { settings: Settings }, { output: string; shellCommand: string }>('settings.write', {
  words: [],
  input: ({ settings }) => (isRecord(settings) ? { settings: settings as Settings } : { refused: 'the settings were not ones the app could read' }),
  async run(ports, { settings }) {
    // Panes already running keep the shell they started with. Nothing here kills one: there are
    // long-running jobs in them, and a settings change is not a reason to lose one.
    const shellCommand = ports.pickShell(settings);
    ports.keep(settings, shellCommand);
    ports.writeFile(settings);
    return { output: 'settings saved', shellCommand };
  },
});
