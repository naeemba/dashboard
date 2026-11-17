// The PreToolUse hook that keeps a project on the package manager its lockfile names: an install
// through another one is refused (workflow-decision-9 says what is refused, what goes
// through, and what it cannot see). It runs inside `board guard` (board-program.ts), so it reaches
// every project the user's ~/.claude/settings.json does.

import { dirname, join } from 'node:path';
import { hookRefusal, invocation, simpleCommands, textField } from '../board/hook-answer';

const LOCKFILES: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
};

// Script runs are left out: the same word means different things per manager (`yarn test` runs a script,
// `bun test` is bun's runner), and a run writes neither the tree nor the lockfile.
const INSTALLS = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade']);

// The nearest lockfile at or above `folder`, up to the folder holding `.git`; null where there is none,
// where no folder up to the root holds `.git` (a stray lockfile in a parent of an un-initialised folder
// is not the project's), or where one folder holds two that name different managers.
export function nearestLockfile(folder: string, exists: (path: string) => boolean): { lockfile: string; manager: string } | null {
  let nearest: { lockfile: string; manager: string } | null | undefined;
  for (let current = folder; ; current = dirname(current)) {
    const found = Object.keys(LOCKFILES).filter((name) => exists(join(current, name)));
    if (nearest === undefined && found.length > 0) {
      const managers = new Set(found.map((name) => LOCKFILES[name]));
      nearest = managers.size === 1 ? { lockfile: found[0], manager: LOCKFILES[found[0]] } : null;
    }
    if (exists(join(current, '.git'))) return nearest ?? null;
    if (dirname(current) === current) return null;
  }
}

// A global install (`npm i -g x`, `pnpm add --global x`) writes no project's tree or lockfile.
const GLOBAL_FLAGS = new Set(['-g', '--global', '--location=global']);

// The managers a command installs through in the project; a bare `yarn` installs.
export function managersUsed(command: string): string[] {
  return simpleCommands(command).flatMap((part) => {
    const call = invocation(part, 'npm|pnpm|yarn|bun');
    if (call === null || call.words.some((word) => GLOBAL_FLAGS.has(word))) return [];
    const subcommand = call.words.find((word) => !word.startsWith('-'));
    return (subcommand === undefined ? call.verb === 'yarn' : INSTALLS.has(subcommand)) ? [call.verb] : [];
  });
}

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through. The command
// is read before the disk, so a call naming no manager costs no file check.
export function packageManagerGuard(toolName: string, toolInput: unknown, folder: string | undefined, exists: (path: string) => boolean) {
  if (toolName !== 'Bash' || folder === undefined) return undefined;
  const used = managersUsed(textField(toolInput, 'command'));
  if (used.length === 0) return undefined;
  const project = nearestLockfile(folder, exists);
  const wrong = project && used.find((verb) => verb !== project.manager);
  return project && wrong ? hookRefusal(
    `This project's lockfile is ${project.lockfile}: install with ${project.manager}, not ${wrong}.`,
  ) : undefined;
}
