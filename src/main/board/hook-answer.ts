import { isRecord } from '../../shared/app/is-record';

// What the PreToolUse guards that `board guard` runs share (board-guard.ts, running-app-guard.ts,
// package-manager-guard.ts): a field of the tool's input, the shell's redirect or tee into a file, a
// command line cut into its simple commands and the verb each runs, and the refusal they print.

export function textField(input: unknown, field: string): string {
  const value = isRecord(input) ? input[field] : undefined;
  return typeof value === 'string' ? value : '';
}

// A `>`, `>>`, `tee` or `tee -a` into whatever follows.
export const SHELL_REDIRECT = String.raw`(?:>>?|\btee(?:\s+-a)?)`;

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
