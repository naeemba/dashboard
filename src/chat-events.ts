import { tagged, unescaped } from './chat-tags';
import { isRecord } from './is-record';

// A message the session's user turn holds that nobody typed: Claude Code injects them — a background
// agent finishing, a subagent's report, a message from another session — and marks each with an
// `origin` whose kind is anything but `human`. Drawn as one folded line, named for what it is, rather
// than as the person's own words in raw tags. A kind this list does not know still folds, under its
// own name, so a new one reads as an event the day it appears.

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
    const fallback = typeof origin.subkind === 'string' ? named(origin.subkind) : 'A background task finished';
    // A background command that finished carries no result: its status and output file stand in. A
    // reminder the harness appends after the closing tag is not part of the message.
    const fields = [['Status', tagged(text, 'status')], ['Output file', tagged(text, 'output-file')]]
      .filter((field): field is [string, string] => Boolean(field[1]?.trim()))
      .map(([name, value]) => `${name}: ${value.trim()}`);
    const rest = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
    return {
      title: summary ? unescaped(summary.trim()) : fallback,
      body: unescaped((result ?? (fields.length > 0 ? fields.join('\n') : rest)).trim()),
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
  return { title: `${named(origin.kind)} message`, body: text.trim() };
}
