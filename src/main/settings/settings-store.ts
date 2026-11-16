import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../shared/app/is-record';
import { parseSettings, withoutShipped, type Settings } from '../../shared/settings/settings';
import { readText } from '../app/missing-file';
import { replaceFile } from '../app/replace-file';
import { ExpectedFailure } from '../command/failure-line';

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
// Readable by this account only: the file holds the host's token and the one this screen joins with,
// and either is enough to type into a shell. The mode on the write covers a new file; the chmod covers
// one an older build left readable by every account on the machine.
function writePrivately(file: string, text: string): void {
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function writeSettings(file: string, settings: Settings, isMac: boolean): void {
  try {
    // The directory may not exist yet the first time anything is written.
    mkdirSync(path.dirname(file), { recursive: true });
    writePrivately(file, serialize(withoutShipped(settings, isMac)));
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
    if (JSON.stringify(tidied) !== JSON.stringify(stored)) writePrivately(file, serialize(tidied));
  } catch {
    // No file, nothing readable in it, or nowhere to write it back. All three mean: leave it alone.
  }
}

// settings.cap's port (`budget --cap`), the file's second writer beside settings.write: the app need not be running, and a
// running one adopts the change when the file does (adoptedSettings). Only budget.weeklyCap changes;
// every other line is written back as it was. A file that does not read as an object is refused
// rather than replaced: the cap is not worth the rest of somebody's settings.
export function writeWeeklyCap(file: string, cap: number): void {
  const text = readText(file);
  let stored: unknown;
  try {
    stored = JSON.parse(text ?? '{}');
  } catch {
    throw new ExpectedFailure(`${file} does not read as JSON; fix it, then set the cap again`);
  }
  if (!isRecord(stored)) throw new ExpectedFailure(`${file} does not hold an object; fix it, then set the cap again`);
  const budget = isRecord(stored.budget) ? stored.budget : {};
  // Whole or not at all: the app reads this file while the command writes it. Renamed over the link's
  // target, not the link, so a settings.json symlinked from a dotfiles repo stays a link.
  replaceFile(text === null ? file : realpathSync(file), serialize({ ...stored, budget: { ...budget, weeklyCap: cap } }), 0o600);
}

// What the app takes from the file when it changes on disk: `budget --cap`, or an edit by hand. Null
// leaves the app's settings as they are: a file that is gone (the app's own next write brings it back,
// and the host token with it) or that does not parse, as one half-saved in an editor does, and one
// that says what the app already holds, as its own writes do.
export function adoptedSettings(file: string, current: Settings, isMac: boolean): Settings | null {
  let next: Settings;
  try {
    next = parseSettings(JSON.parse(readFileSync(file, 'utf8')), isMac);
  } catch {
    return null;
  }
  // A file with no host token (reset to {}, or the host block deleted) keeps the live one: an empty
  // token would lock out the screen that holds it, as resetAll's keeping it avoids.
  if (next.host.token === '') next = { ...next, host: { ...next.host, token: current.host.token } };
  // Both parsed, so the key order a screen's copy was built in is not a change.
  return JSON.stringify(next) === JSON.stringify(parseSettings(current, isMac)) ? null : next;
}
