import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isRecord } from '../../shared/app/is-record';

// What the PreToolUse guards that `board guard` runs share (board-guard.ts, running-app-guard.ts,
// package-manager-guard.ts, worktree-guard.ts, test-run-guard.ts): a field of the tool's input, the
// file tools, the shell's redirect or tee into a file, a command line cut into its simple commands, the
// folder each runs in and the verb each runs, a word of the command as a path, the repository a folder is in, and the refusal
// they print.

export function textField(input: unknown, field: string): string {
  const value = isRecord(input) ? input[field] : undefined;
  return typeof value === 'string' ? value : '';
}

// The tools whose input names the file they write, and the field it is in.
export const FILE_FIELDS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

// A `>`, `>>`, `tee` or `tee -a` into whatever follows.
export const SHELL_REDIRECT = String.raw`(?:>>?|\btee(?:\s+-a)?)`;

// The folder holding `.git` at or above `folder` (a worktree's is a file), or null outside a repository.
export function repositoryTop(folder: string, exists: (path: string) => boolean): string | null {
  for (let current = folder; ; current = dirname(current)) {
    if (exists(join(current, '.git'))) return current;
    if (dirname(current) === current) return null;
  }
}

// A word of the command as a path from `base`, with `$PWD` and `~` read.
export function resolveWord(word: string, base: string): string {
  const expanded = word.replace(/^(?:\$PWD|\$\{PWD\}|\$\(pwd\))(?=\/|$)/, base).replace(/^~(?=\/|$)/, os.homedir());
  return resolve(base, expanded);
}

// A refusal as a PreToolUse hook prints it on stdout.
export function hookRefusal(reason: string) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: reason } };
}

// A command line's pipelines, split at `;`, `&&`, `||`, `&` and newlines, and a pipeline's simple
// commands, split at `|` too. A separator inside quotes is part of its word: `pkill -f "vite|node"`.
// Outside single quotes a `\` escapes the next character (`it\'s`), and outside quotes a `#` starting a
// word comments out the rest of its line, so an apostrophe in either opens no quote.
function split(command: string, atPipes: boolean): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === '\\' && quote !== "'") {
      current += command.slice(index, index + 2);
      index += 1;
      continue;
    }
    if (character === '#' && !quote && /(?:^|\s)$/.test(current)) {
      const end = command.indexOf('\n', index);
      index = (end === -1 ? command.length : end) - 1;
      continue;
    }
    const doubled = (character === '|' || character === '&') && command[index + 1] === character;
    const cuts = character === ';' || character === '\n' || character === '&' || (character === '|' && (atPipes || doubled));
    if (quote || !cuts) {
      if (quote === character) quote = '';
      else if (!quote && (character === '"' || character === "'")) quote = character;
      current += character;
      continue;
    }
    parts.push(current.trim());
    current = '';
    if (doubled) index += 1;
  }
  return [...parts, current.trim()];
}
export const pipelines = (command: string) => split(command, false);
export const simpleCommands = (command: string) => split(command, true);

// A command's words, without their quotes or the `)` or `}` closing a subshell or group.
export const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).map((word) => word.replace(/^["']|["']?[)}]*$/g, ''));

// The quoted body of `sh -c '…'` (bash, zsh, dash too), which runs as a command line of its own.
export function shellBody(part: string): string | null {
  return invocation(part, 'sh|bash|zsh|dash') ? /\s-\w*c\s+(["'])(.*)\1/.exec(part)?.[2] ?? null : null;
}

// What may stand before a verb: a subshell or group opening, then sudo (with its flags), command,
// exec, nohup, nice (with its flags), `timeout <duration>` (with its flags) or env (with its
// assignments), in any order.
const FLAGS = String.raw`(?:\s+-\S+(?:\s+[^-\s]\S*)?)*`;
const PREFIX = String.raw`(?:[({]\s*)?(?:(?:sudo${FLAGS}|command|exec|nohup|nice${FLAGS}|timeout${FLAGS}\s+\S+|env(?:\s+\w+=\S*)*)\s+)*`;

// The verb and its words when `part` runs one of `verbs` (behind PREFIX or a path).
export function invocation(part: string, verbs: string): { verb: string; words: string[] } | null {
  const match = new RegExp(String.raw`^${PREFIX}(?:\S*/)?(${verbs})(?:\s+(.*))?$`).exec(part);
  return match ? { verb: match[1], words: wordsOf(match[2] ?? '') } : null;
}

// Each simple command of `command` with the folder it runs in: `folder`, or where a `cd` earlier in
// the line moved to. A `cd` inside a `( … )` subshell holds until the subshell closes, which puts the
// folder back where the line's own shell is (`shell`, which only a `cd` outside a subshell moves). A `cd`'s flags (`-P`, `-L`) are skipped; a bare `-`,
// the previous folder, is read as a path since that folder is not known.
// ponytail: parentheses are counted without reading quotes; `$( … )` balances itself.
export function partsWithFolders(command: string, folder: string): { part: string; folder: string; shell: string }[] {
  const parts: { part: string; folder: string; shell: string }[] = [];
  let base = folder;
  let shell = folder;
  let depth = 0;
  const count = (text: string, character: string) => text.split(character).length - 1;
  for (const part of simpleCommands(command)) {
    const opening = /^[(\s]*/.exec(part)?.[0] ?? '';
    depth += count(opening, '(');
    parts.push({ part, folder: base, shell });
    const changed = invocation(part, 'cd');
    if (changed) base = resolveWord(changed.words.find((word) => word === '-' || !word.startsWith('-')) ?? '~', base);
    if (changed && depth === 0) shell = base;
    depth += count(part.slice(opening.length), '(') - count(part, ')');
    if (depth <= 0) [depth, base] = [0, shell];
  }
  return parts;
}
