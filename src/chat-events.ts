import { tagged, unescaped } from './chat-commands';
import { isRecord } from './is-record';

// A message the session's user turn holds that nobody typed: Claude Code injects them — a background
// agent finishing, a subagent's report, a message from another session — and marks each with an
// `origin` whose kind is anything but `human`. Drawn as one folded line, named for what it is, rather
// than as the person's own words in raw tags. A kind this list does not know still folds, under its
// own name, so a new one reads as an event the day it appears.

export type InjectedMessage = { title: string; body: string };

// What a user message is when Claude Code injected it, or null when a person typed it. A message with
// no origin is a person's: text pasted from elsewhere can hold the same tags, and must stay theirs.
// The text is asked for only once the message is known to be injected.
export function injectedMessage(origin: unknown, said: () => string): InjectedMessage | null {
  if (!isRecord(origin) || typeof origin.kind !== 'string' || origin.kind === 'human') return null;
  const text = said();
  const named = (kind: string) => {
    const label = kind.replace(/[-_]/g, ' ');
    return `${label[0].toUpperCase()}${label.slice(1)}`;
  };
  if (origin.kind === 'task-notification') {
    // A scheduled run or a coordinator's message comes as a task notification too, told apart by its
    // subkind, and carries no summary of a task that finished.
    const summary = tagged(text, 'summary');
    const result = tagged(text, 'result');
    const fallback = typeof origin.subkind === 'string' ? named(origin.subkind) : 'A background task finished';
    return {
      title: summary ? unescaped(summary.trim()) : fallback,
      body: unescaped((result ?? text).trim()),
    };
  }
  if (origin.kind === 'peer') {
    const sender = [origin.name, origin.from].find((value): value is string => typeof value === 'string') ?? 'another session';
    const body = typeof origin.body === 'string' ? origin.body : text;
    return { title: `Message from ${sender}`, body: body.replace(/^[\s\S]*?The report follows:\n/, '').replace(/^ {2}/gm, '').trim() };
  }
  return { title: `${named(origin.kind)} message`, body: text.trim() };
}
