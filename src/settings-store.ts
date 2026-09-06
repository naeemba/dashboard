import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSettings, type Settings } from './settings';

// Beside the .env file main already reads, not in Electron's userData directory. userData is
// ~/Library/Application Support/Dashboard on macOS, and the point of this file is that a person opens
// it in an editor — delete it, or empty it to {}, and everything is back to how it shipped.
export function settingsFilePath(home: string, xdgConfigHome: string | undefined): string {
  const configHome = xdgConfigHome || path.join(home, '.config');
  return path.join(configHome, 'dashboard', 'settings.json');
}

// Like the session and recents files, reading and writing alike: a missing or damaged file means the
// defaults, and a write that fails must not take down whatever the caller was doing. Losing a settings
// change is a nuisance; losing the window is not.
export function readSettings(file: string, isMac: boolean): Settings {
  try {
    return parseSettings(JSON.parse(readFileSync(file, 'utf8')), isMac);
  } catch {
    return parseSettings({}, isMac);
  }
}

export function writeSettings(file: string, settings: Settings): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    // Indented and newline-terminated: this is a file people edit by hand.
    writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  } catch {
    // The change is live in this run; it just will not survive a restart.
  }
}
