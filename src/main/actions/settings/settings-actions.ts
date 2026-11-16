import { mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import type { Settings } from '../../../shared/settings/settings';
import type { Channels } from '../../app/channels';
import { adoptedSettings } from '../../settings/settings-store';
import { bind, isRefused } from '../action';
import { settingsAdopt, type SettingsAdoptPorts } from './adopt';
import { settingsWrite, type SettingsWritePorts } from './write';

type SettingsFile = { file: string; isMac: boolean; current(): Settings };

// Main's wiring for settings.write, settings.adopt and the screen's door to the first, out of main.ts,
// which is over its 600-line ceiling. The decisions are in write.ts, adopt.ts and adoptedSettings.
export function settingsActions(table: Channels, main: SettingsWritePorts & SettingsAdoptPorts & SettingsFile) {
  const write = bind(settingsWrite, main);
  const adopt = bind(settingsAdopt, main);
  // Answers with the newly resolved shell so the renderer never has to re-derive pickShell's precedence
  // to know which family of shell a dropped path is quoted for.
  table.handle('settings:write', async (_screen, settings: unknown) => {
    const written = await write.call({ settings });
    return isRefused(written) ? written : written.shellCommand;
  });
  // The folder, not the file: an editor that saves by renaming over it would leave a watch on the file
  // watching nothing. Made first, as the first write would make it, because a missing folder cannot be
  // watched.
  try {
    mkdirSync(path.dirname(main.file), { recursive: true });
    watch(path.dirname(main.file), (_event, name) => {
      if (name !== path.basename(main.file)) return;
      const next = adoptedSettings(main.file, main.current(), main.isMac);
      if (next !== null) void adopt.call({ settings: next });
    });
  } catch {
    // No folder to watch: the file is read at the next launch, as it was before there was a watch.
  }
  return { write };
}
