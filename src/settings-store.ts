import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSettings, withoutShipped, type Settings } from './settings';

// Beside the .env file main already reads, not in Electron's userData directory. userData is
// ~/Library/Application Support/Dashboard on macOS, and the point of this file is that a person opens
// it in an editor — delete it, or empty it to {}, and everything is back to how it shipped. What
// gets written is the whole Settings object, every action's key included, so a line in there is
// not proof anyone chose it.
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

// Indented and newline-terminated, because the point of this file is that a person opens it in an
// editor.
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// isMac is here rather than at the call site because withoutShipped is not optional: a caller that
// forgot it would write this build's defaults into the file and freeze them, with nothing failing.
export function writeSettings(file: string, settings: Settings, isMac: boolean): void {
  try {
    // The directory may not exist yet the first time anything is written.
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, serialize(withoutShipped(settings, isMac)));
  } catch {
    // The change is live in this run; it just will not survive a restart.
  }
}

// The launch tidy: the file's own lines, minus the ones this build already ships. A file an older build
// wrote named every key and every colour, so nothing in it could ever follow a default that moved; this
// takes those lines back out and the next move reaches it.
// Only a file that is there and reads as JSON is touched. A damaged one is left exactly as it is —
// rewriting it would throw away the text whoever is fixing it is looking at. A file with nothing to
// take out is left alone too, down to its bytes: keep settings.json in a dotfiles repo and a launch
// must not show up there as a change.
export function tidySettingsFile(file: string, isMac: boolean): void {
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    const tidied = withoutShipped(stored, isMac);
    if (JSON.stringify(tidied) !== JSON.stringify(stored)) writeFileSync(file, serialize(tidied));
  } catch {
    // No file, nothing readable in it, or nowhere to write it back. All three mean: leave it alone.
  }
}
