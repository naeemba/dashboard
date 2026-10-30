import type { ModelInfo, SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import { relativeAge } from './age';
import type { ChatSessions } from './chat-sessions';
import { isModel } from './chat-status';
import { isImageType } from './chat-transcript';
import { fuzzyScore } from './fuzzy';
import type { SearchRow } from './overlay';

// Slash commands on the Claude screen. The session runs every command Claude Code has when it is sent
// as a prompt, skills and the project's own commands included; what the screen adds is the menu that
// lists them as you type, and the few commands that are a terminal dialog in Claude Code and that the
// session answers with "isn't available in this environment". Those are the screen's own and never
// reach the session.

export type CommandRow = SlashCommand;

export type ScreenCommand = { kind: 'resume' } | { kind: 'plan'; rest: string } | { kind: 'model'; rest: string };

export const SCREEN_COMMANDS: CommandRow[] = [
  { name: 'resume', description: 'Pick an earlier conversation of this project and carry on from it', argumentHint: '' },
  { name: 'plan', description: 'Switch to plan mode; anything after it is sent as the prompt', argumentHint: '[what to plan]' },
  // No hint, so Enter opens the list; Tab still leaves room to type a name.
  { name: 'model', description: 'Pick the model from a list, or switch straight to the one named after it', argumentHint: '' },
];

// The command typed into the box when it is one of the screen's own, else null and the text goes to
// the session as it is.
export function screenCommand(text: string): ScreenCommand | null {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (match?.[1] === 'resume') return { kind: 'resume' };
  if (match?.[1] === 'plan') return { kind: 'plan', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'model') return { kind: 'model', rest: (match[2] ?? '').trim() };
  return null;
}

// /plan switches the mode; it also sends a prompt only when something came with it.
export function planSends(rest: string, imageCount: number): boolean {
  return rest !== '' || imageCount > 0;
}

// A command picked from the list: what the box holds after, and whether it runs now. One that takes
// no arguments runs on Enter; otherwise, and on Tab, the box holds it with a space after it, ready
// for them.
export function completion(row: CommandRow, enter: boolean): { text: string; runs: boolean } {
  const runs = enter && !row.argumentHint;
  return { text: `/${row.name}${runs ? '' : ' '}`, runs };
}

// The rows the menu offers for what is in the box: only while it is a slash and a name with nothing
// after it, names starting with what was typed first, then aliases, then names that hold it anywhere.
// A name the session lists twice — its own and a user's — is shown once, its own; a name the screen
// answers itself is the screen's.
export function commandMenu(text: string, sessionCommands: CommandRow[]): CommandRow[] {
  if (!/^\/\S*$/.test(text)) return [];
  const typed = text.slice(1).toLowerCase();
  const byName = new Map<string, CommandRow>();
  for (const row of [...SCREEN_COMMANDS, ...sessionCommands.filter((row) => row.builtin), ...sessionCommands]) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  const rows = [...byName.values()].sort((one, other) => one.name.localeCompare(other.name));
  const starts = rows.filter((row) => row.name.toLowerCase().startsWith(typed));
  const aliased = rows.filter((row) => !starts.includes(row) && row.aliases?.some((alias) => alias.toLowerCase().startsWith(typed)));
  const holds = rows.filter((row) => !starts.includes(row) && !aliased.includes(row) && row.name.toLowerCase().includes(typed));
  return [...starts, ...aliased, ...holds];
}

// What /resume lists for what is typed in its box: the conversations newest first, or the ones whose
// title and branch match it, best first. The one the page is on is marked.
export function resumeRows(found: ChatSessions, query: string, now = Date.now()): SearchRow<string>[] {
  const scored = found.sessions
    .map((session) => ({ session, score: query ? fuzzyScore(`${session.summary} ${session.gitBranch ?? ''}`, query) : 0 }))
    .filter((each): each is { session: ChatSessions['sessions'][number]; score: number } => each.score !== null)
    .sort((one, other) => one.score - other.score || other.session.lastModified - one.session.lastModified);
  return scored.map(({ session }) => ({
    name: `${session.sessionId === found.current ? '● ' : ''}${session.summary}`,
    detail: [relativeAge(session.lastModified, now), session.gitBranch].filter(Boolean).join(' · '),
    choice: session.sessionId,
  }));
}

// What /model lists: the session's models in its own order, or the ones matching what is typed, best
// first. The one the screen is on is marked, whether it was picked by its alias or the session named
// it by its full id.
export function modelRows(models: ModelInfo[], current: string | null, query: string): SearchRow<string>[] {
  return models
    .map((model) => ({ model, score: query ? fuzzyScore(`${model.displayName} ${model.value}`, query) : 0 }))
    .filter((each): each is { model: ModelInfo; score: number } => each.score !== null)
    .sort((one, other) => one.score - other.score)
    .map(({ model }) => {
      const mark = current !== null && isModel(model, current) ? '● ' : '';
      return { name: `${mark}${model.displayName}`, detail: model.description, choice: model.value };
    });
}

// The model `/model x` names, by its alias, full id or shown name; null for one the session does not
// offer, which is refused rather than saved as the model every later session starts on.
export function namedModel(models: ModelInfo[], name: string): string | null {
  const wanted = name.toLowerCase();
  const found = models.find((model) => isModel(model, wanted) || [model.value, model.displayName].some((each) => each.toLowerCase() === wanted));
  return found?.value ?? null;
}

// The model a row of the list is picked by, as the screen keeps it: the "default" row is no model
// named at all, which is how the model key spells the default too.
export function pickedModel(value: string): string | null {
  return value === 'default' ? null : value;
}

// What a saved session wrote between `<tag>` and `</tag>`, or undefined when the tag is not there.
function tagged(text: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1];
}

// A command as a saved session writes it, `<command-name>/x</command-name>` and its arguments in tags
// of their own, read back as what was typed. Null for a message that is not one.
export function typedCommand(text: string): string | null {
  const name = tagged(text, 'command-name')?.trim();
  if (!name) return null;
  const args = tagged(text, 'command-args')?.trim();
  const command = name.startsWith('/') ? name : `/${name}`;
  return args ? `${command} ${args}` : command;
}

// A file dropped on the screen that is not an image to attach, as the box takes it: an @ mention, the
// way Claude Code takes a dropped file, so Claude reads it. A path with a space is quoted, which is
// how Claude Code writes one.
export function fileMention(path: string): string {
  return /\s/.test(path) ? `@"${path}"` : `@${path}`;
}

// What goes in at the caret for the dropped files: their mentions, set off from a word just before
// them by a space, and a space after so typing carries on as a new word.
export function mentionInsertion(before: string, mentions: string[]): string {
  const gap = before === '' || /\s$/.test(before) ? '' : ' ';
  return `${gap}${mentions.join(' ')} `;
}

// What a drop does with each file: a picture is attached, anything else with a path on disk (another
// kind of file, a folder) goes in the box as an @ mention. A file with no path, such as an SVG dragged
// out of a web page, has nothing to mention; a drop that leaves nothing at all is refused.
export function droppedFiles<T extends { type: string; path: string }>(files: T[]): { pictures: T[]; paths: string[]; refused: boolean } {
  const pictures = files.filter((file) => isImageType(file.type));
  const paths = files.filter((file) => !isImageType(file.type)).map((file) => file.path).filter(Boolean);
  return { pictures, paths, refused: files.length > 0 && pictures.length === 0 && paths.length === 0 };
}

// A command run with `!` in Claude Code, as a saved session writes it: what was typed in
// `<bash-input>`, as typed, and what it printed in `<bash-stdout>` and `<bash-stderr>`, where &, < and >
// are escaped. Read back as the line typed, `! git push`, or as the output, stdout then stderr. Each is
// the whole message, so a prompt that quotes the tags stays a prompt. Null for anything else.
export type ShellExchange = { kind: 'input'; text: string } | { kind: 'output'; text: string };

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

function unescaped(text: string): string {
  return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => ENTITIES[entity]);
}

export function shellExchange(text: string): ShellExchange | null {
  if (!text.includes('<bash-')) return null;
  const input = /^\s*<bash-input>([\s\S]*?)<\/bash-input>\s*$/.exec(text);
  if (input) return { kind: 'input', text: `! ${input[1].trim()}` };
  const output = /^\s*<bash-stdout>([\s\S]*?)<\/bash-stdout>\s*(?:<bash-stderr>([\s\S]*?)<\/bash-stderr>)?\s*$/.exec(text);
  if (!output) return null;
  const printed = [output[1], output[2]].map((part) => unescaped(part ?? '').trimEnd()).filter(Boolean);
  return { kind: 'output', text: printed.join('\n') };
}

// Which of an entry's blocks the copy key copies: the first, then the next on each press while the
// same entry stays selected, round to the first again. Null when the entry has none.
export function nextCopyBlock(previous: { entry: number; block: number } | null, entry: number, count: number): number | null {
  if (count === 0) return null;
  return previous?.entry === entry ? (previous.block + 1) % count : 0;
}
