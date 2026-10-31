import { describe, expect, it } from 'vitest';
import { conversationText, exportFileName, exportRows } from './chat-export';
import type { ChatEntry } from './chat-transcript';

const entries: ChatEntry[] = [
  { kind: 'user', text: 'Fix the foot,\nplease', images: [{ mediaType: 'image/png', data: '' }] },
  { kind: 'text', text: 'Reading it.' },
  { kind: 'tool', id: 't1', name: 'Bash', input: { command: 'git status\n--short' }, result: null },
  { kind: 'user', text: '! ls', images: [], ran: true },
  { kind: 'shell', text: 'a\nb' },
  { kind: 'notice', text: '' },
  { kind: 'event', title: 'Thinking', body: 'hidden' },
];

describe('conversationText', () => {
  it('writes prompts behind >, tools as one line and skips empty entries', () => {
    expect(conversationText(entries)).toBe([
      '> Fix the foot,\n  please\n  [Image #1]',
      '⏺ Reading it.',
      '⏺ Bash(git status)',
      '> ! ls',
      '  ⎿  a\n     b',
      '⏺ Thinking',
    ].join('\n\n') + '\n');
  });
});

describe('exportFileName', () => {
  const now = new Date(2026, 10, 1, 14, 5, 9);
  it('names the file by the time and first prompt', () => {
    expect(exportFileName('', entries, now)).toBe('2026-11-01-140509-fix-the-foot-please.txt');
  });
  it('cuts a long first prompt at 50 characters, never ending on a hyphen', () => {
    const long: ChatEntry[] = [{ kind: 'user', text: 'Rename every helper in the board view module sort of well', images: [] }];
    expect(exportFileName('', long, now)).toBe('2026-11-01-140509-rename-every-helper-in-the-board-view-module-sort.txt');
  });
  it('is the time alone with no prompt', () => {
    expect(exportFileName('', [], now)).toBe('2026-11-01-140509.txt');
  });
  it('takes the typed name, adding .txt only without an extension', () => {
    expect(exportFileName('notes', entries, now)).toBe('notes.txt');
    expect(exportFileName('notes.md', entries, now)).toBe('notes.md');
  });
});

describe('exportRows', () => {
  it('lists both choices, narrowed by what is typed', () => {
    expect(exportRows('').map((row) => row.choice)).toEqual(['clipboard', 'file']);
    expect(exportRows('save').map((row) => row.choice)).toEqual(['file']);
  });
});
