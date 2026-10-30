import { tagged, unescaped } from './chat-tags';
import { isRecord } from './is-record';

// A message the session's user turn holds that nobody typed: Claude Code injects them — a background
// agent finishing, a subagent's report, a message from another session — and marks each with an
// `origin` whose kind is anything but `human`. Drawn as one folded line, named for what it is, rather
// than as the person's own words in raw tags. A kind this list does not know still folds, under its
// own name, so a new one reads as an event the day it appears.

// Tags a notification carries that are its title or its plumbing, not something to read.
const HIDDEN_TAGS = new Set(['summary', 'task-id', 'tool-use-id']);

export type InjectedMessage = { title: string; body: string };

// What a user message is when Claude Code injected it, or null when a person typed it. A message with
// no origin is a person's: text pasted from elsewhere can hold the same tags, and must stay theirs.
export function injectedMessage(origin: unknown, text: string): InjectedMessage | null {
  if (!isRecord(origin) || typeof origin.kind !== 'string' || origin.kind === 'human') return null;
  const named = (kind: string) => {
    const label = kind.replace(/[-_]/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  if (origin.kind === 'task-notification') {
    // A scheduled run or a coordinator's message comes as a task notification too, told apart by its
    // subkind, and carries no summary of a task that finished.
    const summary = tagged(text, 'summary');
    const result = tagged(text, 'result');
    const fallback = origin.subkind ? named(String(origin.subkind)) : 'A background task finished';
    // With no result, every other tag inside the notification stands in, one paragraph each, since
    // markdown folds a single newline into a space — a command's status and output file, a Monitor
    // event, the note on why a workflow stopped. The envelope itself, and a reminder the harness
    // appends after it, are never shown: an empty body beats raw tags.
    const inside = tagged(text, 'task-notification');
    const fields = [...(inside ?? '').matchAll(/<([a-z-]+)>([\s\S]*?)<\/\1>/g)]
      .filter(([, tag, value]) => !HIDDEN_TAGS.has(tag) && value.trim())
      .map(([, tag, value]) => `${named(tag)}: ${value.trim()}`);
    return {
      title: summary ? unescaped(summary.trim()) : fallback,
      body: unescaped((result ?? (inside === undefined ? text : fields.join('\n\n'))).trim()),
    };
  }
  if (origin.kind === 'peer') {
    const sender = [origin.name, origin.from].find((value): value is string => typeof value === 'string') ?? 'another session';
    // With no body of its own, the message is the text inside its envelope. A subagent's hand-back is
    // a preamble, then the report with every line indented by two spaces; any other message keeps its
    // own indentation.
    const body = typeof origin.body === 'string' ? origin.body : tagged(text, 'agent-message') ?? text;
    const report = /The report follows:\n([\s\S]*)$/.exec(body);
    return { title: `Message from ${sender}`, body: (report ? report[1].replace(/^ {2}/gm, '') : body).trim() };
  }
  return { title: origin.kind ? `${named(origin.kind)} message` : 'A message', body: text.trim() };
}

// Text Claude Code wrote into the conversation as instructions to Claude rather than as anything said:
// a skill's body once it loads, or the prompt a slash command expands to. A saved session marks it
// `isMeta`, a live one `isSynthetic`. Folded under the skill's name, or as the command's prompt, so a
// page of instructions never reads as something you typed. Null for what is only plumbing — a pasted
// image's source path, a reminder, the caveat a local command leaves — which shows nothing.
export function instructionsMessage(text: string, skill: string | undefined): InjectedMessage | null {
  const body = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (body === '' || /^(?:\[Image: source: [^\]]*\]\s*)+$/.test(body) || /^<local-command-caveat>/.test(body)) return null;
  const directory = /^Base directory for this skill: (\S+)/.exec(body)?.[1];
  const name = skill ?? directory?.split('/').filter(Boolean).at(-1);
  return { title: name ? `${name} skill` : 'Command prompt', body };
}
