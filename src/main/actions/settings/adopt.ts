import type { Settings } from '../../../shared/settings/settings';
import { action } from '../action';
import type { SettingsWritePorts } from './write';

// settings.json changed on disk, by `dashboard budget --cap` or by hand, and main takes it as its live
// copy and tells the window, so the next save from the screen does not put the old lines back. Nothing
// is written: the file already says it, and writing back what parseSettings read would repair a typo
// out of the file somebody is still editing. adoptedSettings (settings-store.ts) says when to call it.

export type SettingsAdoptPorts = Omit<SettingsWritePorts, 'writeFile'> & {
  // The window's copy, which the settings screen saves from.
  tell(settings: Settings, shellCommand: string): void;
};

export const settingsAdopt = action<SettingsAdoptPorts, { settings: Settings }, { output: string; shellCommand: string }>('settings.adopt', {
  words: [],
  // adoptedSettings has already parsed it; its one caller is the watch.
  input: ({ settings }) => ({ settings: settings as Settings }),
  async run(ports, { settings }) {
    const shellCommand = ports.pickShell(settings);
    ports.keep(settings, shellCommand);
    ports.tell(settings, shellCommand);
    return { output: 'settings read from the file', shellCommand };
  },
});
