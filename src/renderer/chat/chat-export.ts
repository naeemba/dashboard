import { localDate, pad } from './chat-stamp';
import type { ChatEntry } from '../../shared/chat/chat-transcript';
import { toolSummary } from './chat-tools';
import { ranked } from '../../shared/app/fuzzy';
import type { SearchRow } from '../app/overlay';

// /export: the conversation on the Claude screen as plain text, the way Claude Code's /export writes
// it — a prompt behind `>`, Claude's text as it came, each tool call one `⏺ Name(what)` line — copied
// to the clipboard or saved as a file in the project's folder.

export type ExportChoice = 'clipboard' | 'file';

const EXPORT_CHOICES: { choice: ExportChoice; name: string; detail: string }[] = [
  { choice: 'clipboard', name: 'Copy to clipboard', detail: 'The conversation as plain text' },
  { choice: 'file', name: 'Save to file', detail: "A .txt file in the project's folder" },
];

// What bare /export lists, or the rows matching what is typed.
export function exportRows(query: string): SearchRow<ExportChoice>[] {
  return ranked(EXPORT_CHOICES, (row) => row.name, query);
}

const indented = (text: string, first: string, rest: string) =>
  text.split('\n').map((line, index) => (index === 0 ? first + line : line === '' ? '' : rest + line)).join('\n');

function entryText(entry: ChatEntry): string {
  switch (entry.kind) {
    case 'user': {
      const pictures = entry.images.map((_, index) => `[Image #${index + 1}]`).join(' ');
      return indented([entry.text, pictures].filter(Boolean).join('\n'), '> ', '  ');
    }
    case 'text': return indented(entry.text, '⏺ ', '  ');
    case 'tool': return `⏺ ${entry.name}(${toolSummary(entry.name, entry.input)})`;
    case 'shell': return indented(entry.text, '  ⎿  ', '     ');
    case 'notice': return entry.text;
    case 'event': return `⏺ ${entry.title}`;
  }
}

// The conversation as one text, an entry per paragraph. An entry with nothing to say is left out.
export function conversationText(entries: ChatEntry[]): string {
  return `${entries.map(entryText).filter((text) => text.trim() !== '').join('\n\n')}\n`;
}

// The name a file is saved under: the one typed after /export, given `.txt` when it has no extension,
// else Claude Code's own, the time and the first prompt's words, `2026-11-01-142530-fix-the-foot.txt`.
export function exportFileName(typed: string, entries: ChatEntry[], now: Date): string {
  if (typed !== '') return /\.[^./\\]+$/.test(typed) ? typed : `${typed}.txt`;
  const stamp = `${localDate(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const first = entries.find((entry) => entry.kind === 'user')?.text ?? '';
  const words = (first.toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-').slice(0, 50).replace(/-+$/, '');
  return `${stamp}${words ? `-${words}` : ''}.txt`;
}
