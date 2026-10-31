import type { EffortLevel, ModelInfo, SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import { relativeAge } from './age';
import { onlyPlumbing } from './chat-events';
import type { ChatSessions } from './chat-sessions';
import { isModel } from './chat-status';
import { tagged, unescaped } from './chat-tags';
import { isImageType, type ChatEntry } from './chat-transcript';
import type { FootState } from './chat-foot-view';
import { fuzzyScore, ranked } from './fuzzy';
import type { SearchRow } from './overlay';

// Slash commands on the Claude screen. The session runs every command Claude Code has when it is sent
// as a prompt, skills and the project's own commands included; what the screen adds is the menu that
// lists them as you type, and the few commands that are a terminal dialog in Claude Code and that the
// session answers with "isn't available in this environment". Those are the screen's own and never
// reach the session. The file also holds the screen's other small decisions about what was typed or
// pressed there: reading a `!` command's exchange back out of the transcript, and which block the copy
// key copies.

export type CommandRow = SlashCommand;

export type ScreenCommand =
  | { kind: 'resume' } | { kind: 'diff' } | { kind: 'rewind' } | { kind: 'mcp' } | { kind: 'plan'; rest: string } | { kind: 'model'; rest: string } | { kind: 'effort'; rest: string }
  | { kind: 'branch'; rest: string } | { kind: 'rename'; rest: string } | { kind: 'copy'; rest: string };

export const SCREEN_COMMANDS: CommandRow[] = [
  { name: 'resume', description: 'Pick an earlier conversation of this project and carry on from it', argumentHint: '' },
  { name: 'diff', description: 'Review every change Claude made to a file in this conversation', argumentHint: '' },
  { name: 'rewind', description: 'Put the code, the conversation or both back to just before an earlier prompt', argumentHint: '' },
  { name: 'mcp', description: 'List the session\'s MCP servers and reconnect, disable or enable one', argumentHint: '' },
  { name: 'plan', description: 'Switch to plan mode; anything after it is sent as the prompt', argumentHint: '[what to plan]' },
  // No hint, so Enter opens the list; Tab still leaves room to type a name.
  { name: 'model', description: 'Pick the model from a list, or switch straight to the one named after it', argumentHint: '' },
  { name: 'effort', description: 'Pick how hard Claude thinks, low to max, from a list, or set the level named after it', argumentHint: '' },
  // No hint either: the name is optional, so Enter branches now.
  { name: 'branch', description: 'Carry on in a copy of this conversation, called whatever follows, if anything; the original stays in /resume', argumentHint: '' },
  { name: 'rename', description: 'Name this conversation; /resume lists it by that name', argumentHint: '<name>' },
  // No hint: the count is optional, so Enter copies the last reply now.
  { name: 'copy', description: "Copy Claude's last reply as markdown, or the one that many back named after it", argumentHint: '' },
];

// The command typed into the box when it is one of the screen's own, else null and the text goes to
// the session as it is.
export function screenCommand(text: string): ScreenCommand | null {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (match?.[1] === 'resume') return { kind: 'resume' };
  if (match?.[1] === 'diff') return { kind: 'diff' };
  if (match?.[1] === 'rewind') return { kind: 'rewind' };
  if (match?.[1] === 'mcp') return { kind: 'mcp' };
  if (match?.[1] === 'plan') return { kind: 'plan', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'model') return { kind: 'model', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'effort') return { kind: 'effort', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'branch') return { kind: 'branch', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'rename') return { kind: 'rename', rest: (match[2] ?? '').trim() };
  if (match?.[1] === 'copy') return { kind: 'copy', rest: (match[2] ?? '').trim() };
  return null;
}

// What /effort offers, lowest first. Auto is the model's own default, as /effort auto is in Claude
// Code. A model without max runs it as high; the session decides that, not the screen.
export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

// The effort the screen has chosen: undefined until anything is picked, when the session runs at the
// level in the user's settings file, which the screen does not read; null for auto, which overrides
// that settings level with the model's default.
export type ChosenEffort = EffortLevel | null | undefined;

// The level `/effort x` names: null for auto, undefined for a word that is no level, which is refused.
export function namedEffort(name: string): EffortLevel | null | undefined {
  const wanted = name.toLowerCase();
  if (wanted === 'auto') return null;
  return EFFORT_LEVELS.find((level) => level === wanted);
}

const EFFORT_DETAILS: Record<string, string> = {
  auto: "The model's own default, over any level in your settings",
  max: 'This session only; high on a model without it',
};

// What /effort lists: auto, then the levels lowest first, or the ones matching what is typed, best
// first. The one the screen is on is marked; none is until one is picked.
export function effortRows(current: ChosenEffort, query: string): SearchRow<EffortLevel | null>[] {
  return ranked([null, ...EFFORT_LEVELS], (level) => level ?? 'auto', query).map((level) => ({
    name: `${level === current ? '● ' : ''}${level ?? 'auto'}`,
    detail: EFFORT_DETAILS[level ?? 'auto'] ?? '',
    choice: level,
  }));
}

// Whether a prompt asks for deeper thinking on its turn with the ultrathink keyword. The session acts on
// the word itself; the screen only says so while that turn runs.
export function asksUltrathink(text: string): boolean {
  return /\bultrathink\b/i.test(text);
}

// What the foot says for effort. While a turn runs or waits on a question, ultrathink when the newest
// prompt asks for it; a prompt sent while a turn runs counts too, since the screen knows what was asked
// last, not which turn the session folds it into. Otherwise the level chosen, or `default effort`
// before one is, as the session is then on the settings file's level.
export function footEffort(effort: ChosenEffort, state: FootState, entries: ChatEntry[]): { label: string; ultrathink: boolean } {
  const ultrathink = state !== 'ready' && asksUltrathink(entries.findLast((entry) => entry.kind === 'user')?.text ?? '');
  if (ultrathink) return { label: 'ultrathink', ultrathink };
  return { label: effort === undefined ? 'default effort' : `${effort ?? 'auto'} effort`, ultrathink };
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

// What Tab fills the box with: the row picked in the open list (a command or an @ file), else the suggestion, and that only
// into an empty box, so a half-typed prompt is never replaced.
export function tabFill<Row>(picked: Row | null, typed: string, suggestion: string | null):
  { kind: 'command'; row: Row } | { kind: 'suggestion'; text: string } | null {
  if (picked) return { kind: 'command', row: picked };
  return typed === '' && suggestion !== null ? { kind: 'suggestion', text: suggestion } : null;
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

export function shellExchange(text: string): ShellExchange | null {
  if (!text.includes('<bash-')) return null;
  const input = /^\s*<bash-input>([\s\S]*?)<\/bash-input>\s*$/.exec(text);
  if (input) return { kind: 'input', text: `! ${input[1].trim()}` };
  const output = /^\s*<bash-stdout>([\s\S]*?)<\/bash-stdout>\s*(?:<bash-stderr>([\s\S]*?)<\/bash-stderr>)?\s*$/.exec(text);
  if (!output) return null;
  const printed = [output[1], output[2]].map((part) => unescaped(part ?? '').trimEnd()).filter(Boolean);
  return { kind: 'output', text: printed.join('\n') };
}

// What a slash command Claude Code ran itself printed, as a saved session writes it: its output in
// `<local-command-stdout>` or `<local-command-stderr>`, with the escapes undone. The caveat that rides
// along with one is plumbing (chat-events.ts) and reads as '', shown as nothing: a saved session marks
// it isMeta, but one arriving unmarked still reaches here. Other plumbing arriving unmarked, such as a
// reminder pasted on its own, is the person's and stays. Null for a message that is neither.
export function localCommandOutput(text: string): string | null {
  if (text.includes('<local-command-caveat>') && onlyPlumbing(text)) return '';
  const output = /^\s*<local-command-(?:stdout|stderr)>([\s\S]*?)<\/local-command-(?:stdout|stderr)>\s*$/.exec(text);
  return output ? unescaped(output[1]).trim() : null;
}

// How many replies back `/copy N` goes: 1, the last, when nothing follows; null for anything but a
// whole number from 1, which is refused.
export function copyCount(rest: string): number | null {
  if (!rest) return 1;
  return /^[1-9]\d*$/.test(rest) ? Number(rest) : null;
}

// What /copy copies: the markdown of Claude's reply that many back, 1 the last. A reply is all Claude
// wrote between two prompts, its tool calls left out; null when there are not that many.
export function replyText(entries: ChatEntry[], count: number): string | null {
  const replies: string[] = [];
  let open = false;
  for (const entry of entries) {
    if (entry.kind === 'user') open = false;
    else if (entry.kind === 'text') {
      if (open) replies[replies.length - 1] += `\n\n${entry.text}`;
      else replies.push(entry.text);
      open = true;
    }
  }
  return replies.at(-count) ?? null;
}

// Which of an entry's blocks the copy key copies: the first, then the next on each press while the
// same entry stays selected, round to the first again. Null when the entry has none.
export function nextCopyBlock(previous: { entry: number; block: number } | null, entry: number, count: number): number | null {
  if (count === 0) return null;
  return previous?.entry === entry ? (previous.block + 1) % count : 0;
}
