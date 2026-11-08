import type { Channels } from '../../app/channels';
import { bind, isRefused } from '../action';
import { settingsWrite, type SettingsWritePorts } from './write';

// Main's wiring for settings.write and the screen's door to it, out of main.ts, which is over its
// 600-line ceiling. The decision is in write.ts.
export function settingsActions(table: Channels, main: SettingsWritePorts) {
  const write = bind(settingsWrite, main);
  // Answers with the newly resolved shell so the renderer never has to re-derive pickShell's precedence
  // to know which family of shell a dropped path is quoted for.
  table.handle('settings:write', async (_screen, settings: unknown) => {
    const written = await write.call({ settings });
    return isRefused(written) ? written : written.shellCommand;
  });
  return { write };
}
