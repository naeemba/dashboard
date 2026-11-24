// The PreToolUse hook that keeps a project on the package manager its lockfile names: an install
// through another one is refused (workflow-decision-9 says what is refused, what goes
// through, and what it cannot see). It runs inside `board guard` (board-program.ts), so it reaches
// every project the user's ~/.claude/settings.json does.

import { dirname, join } from 'node:path';
import { hookRefusal, invocation, partsWithFolders, repositoryTop, textField } from '../board/hook-answer';

const LOCKFILES: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
};

// Script runs are left out: the same word means different things per manager (`yarn test` runs a script,
// `bun test` is bun's runner), and a run writes neither the tree nor the lockfile.
const INSTALLS = new Set([
  'install', 'i', 'ci', 'clean-install', 'ic', 'install-clean', 'it', 'install-test', 'cit', 'install-ci-test',
  'add', 'remove', 'rm', 'r', 'uninstall', 'un', 'unlink', 'update', 'up', 'upgrade',
]);

// The nearest lockfile at or above `folder`, up to the folder holding `.git`; null where there is none,
// where no folder up to the root holds `.git` (a stray lockfile in a parent of an un-initialised folder
// is not the project's), or where one folder holds two that name different managers.
export function nearestLockfile(folder: string, exists: (path: string) => boolean): { lockfile: string; manager: string } | null {
  const top = repositoryTop(folder, exists);
  if (top === null) return null;
  for (let current = folder; ; current = dirname(current)) {
    const found = Object.keys(LOCKFILES).filter((name) => exists(join(current, name)));
    if (found.length > 0) {
      const managers = new Set(found.map((name) => LOCKFILES[name]));
      return managers.size === 1 ? { lockfile: found[0], manager: LOCKFILES[found[0]] } : null;
    }
    if (current === top) return null;
  }
}

// A global install (`npm i -g x`, `pnpm add --global x`) writes no project's tree or lockfile.
const GLOBAL_FLAGS = new Set(['-g', '--global', '--location=global']);

// The installs a command line runs, each with its manager and the folder it runs in: `folder`, or where
// a `cd` earlier in the line moved to (`cd storefront && pnpm install`). A bare `yarn` installs.
// ponytail: `pnpm -C <dir>` is not read, as in test-run-guard.ts.
export function installsRun(command: string, folder: string) {
  const installs: { manager: string; folder: string }[] = [];
  for (const { part, folder: base } of partsWithFolders(command, folder)) {
    const call = invocation(part, 'npm|pnpm|yarn|bun');
    if (call === null || call.words.some((word) => GLOBAL_FLAGS.has(word))) continue;
    const subcommand = call.words.find((word) => !word.startsWith('-'));
    if (subcommand === undefined ? call.verb === 'yarn' : INSTALLS.has(subcommand)) installs.push({ manager: call.verb, folder: base });
  }
  return installs;
}

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through. The command
// is read before the disk, so a call naming no manager costs no file check.
export function packageManagerGuard(toolName: string, toolInput: unknown, folder: string | undefined, exists: (path: string) => boolean) {
  if (toolName !== 'Bash' || folder === undefined) return undefined;
  for (const install of installsRun(textField(toolInput, 'command'), folder)) {
    const project = nearestLockfile(install.folder, exists);
    if (project && install.manager !== project.manager) {
      return hookRefusal(`This project's lockfile is ${project.lockfile}: install with ${project.manager}, not ${install.manager}.`);
    }
  }
  return undefined;
}
