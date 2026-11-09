import { readFileSync, realpathSync, statSync } from 'node:fs';
import { readText } from '../app/missing-file';
import { isRecord } from '../../shared/app/is-record';
import path from 'node:path';
import { replaceFile, replaceFileIfChanged } from '../app/replace-file';
import { failureLine } from '../command/failure-line';
import { GUARD_COMMAND, guardEntry } from './board-guard';

// The board guard for a Claude the app did not start: a terminal of your own, another editor's
// agent. At each launch the app copies this build's board program to ~/.claude/dashboard/board.js and,
// only when ~/.claude/settings.json has no PreToolUse entry running it, adds one (board-decision-8).
//
// The copy is at one path under $HOME, so the entry reads the same on every machine a dotfiles
// settings.json is shared between, and keeps working while the app is being swapped for a new build.
// It is the whole board program, so the refusal it prints names a command that works outside a pane.
//
// The settings file is never rewritten for anything else: an entry already there, under any matcher,
// is left as it is, and so is every other key. A file that is not a JSON object, or whose hooks are
// not the shape Claude Code reads, is refused rather than repaired. Removing the entry is undone at
// the next launch; that is what "only if missing" means here.

function runsGuard(entry: unknown): boolean {
  return isRecord(entry) && Array.isArray(entry.hooks)
    && entry.hooks.some((hook) => isRecord(hook) && hook.command === GUARD_COMMAND);
}

// The settings file's text with the guard added: `text` null when there is nothing to write, or a
// refusal when the file is not something to edit. `current` null is a file that is not there yet.
export function withBoardGuard(current: string | null): { text: string | null } | { refused: string } {
  let settings: unknown;
  try {
    settings = current === null || current.trim() === '' ? {} : JSON.parse(current);
  } catch {
    return { refused: 'it is not JSON' };
  }
  if (!isRecord(settings)) return { refused: 'it is not a JSON object' };
  const hooks = settings.hooks ?? {};
  if (!isRecord(hooks)) return { refused: 'its hooks are not an object' };
  const preToolUse = hooks.PreToolUse ?? [];
  if (!Array.isArray(preToolUse)) return { refused: 'its PreToolUse hooks are not a list' };
  if (preToolUse.some(runsGuard)) return { text: null };
  const next = { ...settings, hooks: { ...hooks, PreToolUse: [...preToolUse, guardEntry(GUARD_COMMAND)] } };
  return { text: `${JSON.stringify(next, null, 2)}\n` };
}

// `builtBoard` is the board-cli-entry.js this build carries. Answers the line to log when it could
// not install, or null: a failure here costs the guard, never the launch.
export function installBoardGuard(home: string, builtBoard: string): string | null {
  try {
    const folder = path.join(home, '.claude', 'dashboard');
    replaceFileIfChanged(path.join(folder, 'board.js'), readFileSync(builtBoard, 'utf8'));
    // Node reads a .js as ESM under a package.json saying "type": "module", and one in ~ would make
    // the CommonJS program fail (create-task-install.ts installs the same).
    replaceFileIfChanged(path.join(folder, 'package.json'), '{"type":"commonjs"}\n');
    const linked = path.join(home, '.claude', 'settings.json');
    // Through the link: a settings.json linked into a dotfiles repo stays a link, and the entry lands
    // in the file it points at.
    const current = readText(linked);
    const file = current === null ? linked : realpathSync(linked);
    const next = withBoardGuard(current);
    if ('refused' in next) return `board guard not added to ${linked}: ${next.refused}`;
    // With the mode it had, so a settings file kept private stays so.
    if (next.text !== null) replaceFile(file, next.text, current === null ? undefined : statSync(file).mode & 0o777);
    return null;
  } catch (error: unknown) {
    return `board guard not installed: ${failureLine(error)}`;
  }
}
