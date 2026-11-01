import { describe, expect, it } from 'vitest';
import { lineDiff, todoChecklist, toolDiff, toolSummary } from './chat-tools';

describe('toolSummary', () => {
  it('says the command a Bash call ran, first line only', () => {
    expect(toolSummary('Bash', { command: 'npm test\necho done' })).toBe('npm test');
  });

  it('says the file a Read call read', () => {
    expect(toolSummary('Read', { file_path: '/a/b.ts' })).toBe('/a/b.ts');
  });

  it('says the first string of a tool it does not know', () => {
    expect(toolSummary('mcp__x__find', { limit: 3, query: 'needle' })).toBe('needle');
  });

  it('says nothing for a call that arrived with nothing', () => {
    expect(toolSummary('Bash', {})).toBe('');
  });

  it('cuts a long line', () => {
    expect(toolSummary('Bash', { command: 'x'.repeat(500) })).toHaveLength(160);
  });
});

describe('lineDiff', () => {
  it('keeps one unchanged line either side of the change', () => {
    expect(lineDiff('a\nb\nc\nd', 'a\nb\nX\nd')).toEqual([
      { sign: ' ', text: 'b' },
      { sign: '-', text: 'c' },
      { sign: '+', text: 'X' },
      { sign: ' ', text: 'd' },
    ]);
  });

  it('shows a pure insertion as added lines only', () => {
    expect(lineDiff('a\nc', 'a\nb\nc')).toEqual([
      { sign: ' ', text: 'a' },
      { sign: '+', text: 'b' },
      { sign: ' ', text: 'c' },
    ]);
  });

  it('shows two edits far apart as two runs, not everything between them', () => {
    expect(lineDiff('a\nb\nc\nd\ne\nf\ng', 'A\nb\nc\nd\ne\nf\nG')).toEqual([
      { sign: '-', text: 'a' },
      { sign: '+', text: 'A' },
      { sign: ' ', text: 'b' },
      { sign: '…', text: '' },
      { sign: ' ', text: 'f' },
      { sign: '-', text: 'g' },
      { sign: '+', text: 'G' },
    ]);
  });

  it('shows an unchanged line between two changes once, with no gap', () => {
    expect(lineDiff('a\nb\nc', 'A\nb\nC')).toEqual([
      { sign: '-', text: 'a' },
      { sign: '+', text: 'A' },
      { sign: ' ', text: 'b' },
      { sign: '-', text: 'c' },
      { sign: '+', text: 'C' },
    ]);
  });

  it('shows a lone unchanged line between two runs rather than a gap row in its place', () => {
    expect(lineDiff('a\nb\nc\nd\ne', 'A\nb\nc\nd\nE').map((line) => line.sign)).toEqual(['-', '+', ' ', ' ', ' ', '-', '+']);
  });

  it('shows one changed line of a long edit as that line alone, with its context', () => {
    const lines = Array.from({ length: 1001 }, (_, index) => `line ${index}`);
    const changed = lines.map((line, index) => (index === 500 ? 'changed' : line));
    expect(lineDiff(lines.join('\n'), changed.join('\n'))).toEqual([
      { sign: ' ', text: 'line 499' },
      { sign: '-', text: 'line 500' },
      { sign: '+', text: 'changed' },
      { sign: ' ', text: 'line 501' },
    ]);
  });

  it('shows a changed middle too big to compare as all removed, then all added', () => {
    const old = ['kept', ...Array.from({ length: 1000 }, (_, index) => `old ${index}`)];
    const next = [...Array.from({ length: 1000 }, (_, index) => `new ${index}`), 'kept'];
    expect(lineDiff(old.join('\n'), next.join('\n'))).toEqual([
      ...old.map((text) => ({ sign: '-', text })),
      ...next.map((text) => ({ sign: '+', text })),
    ]);
  });

  it('shows a one-line replacement with no context', () => {
    expect(lineDiff('old', 'new')).toEqual([{ sign: '-', text: 'old' }, { sign: '+', text: 'new' }]);
  });
});

describe('toolDiff', () => {
  it('shows a Write as every line added', () => {
    expect(toolDiff('Write', { content: 'a\nb' })).toEqual([{ sign: '+', text: 'a' }, { sign: '+', text: 'b' }]);
  });

  it('skips a MultiEdit entry that is not an edit rather than throwing', () => {
    expect(toolDiff('MultiEdit', { edits: [null, { old_string: 'a', new_string: 'b' }] }))
      .toEqual([{ sign: '-', text: 'a' }, { sign: '+', text: 'b' }]);
  });

  it('puts a gap row between the edits of a MultiEdit', () => {
    expect(toolDiff('MultiEdit', { edits: [{ old_string: 'a', new_string: 'A' }, { old_string: 'b', new_string: 'B' }] })).toEqual([
      { sign: '-', text: 'a' },
      { sign: '+', text: 'A' },
      { sign: '…', text: '' },
      { sign: '-', text: 'b' },
      { sign: '+', text: 'B' },
    ]);
  });

  it('has no diff for an edit that changes nothing, so its input shows instead', () => {
    expect(toolDiff('Edit', { old_string: 'same', new_string: 'same' })).toBeNull();
  });

  it('has nothing to show for a Bash call', () => {
    expect(toolDiff('Bash', { command: 'ls' })).toBeNull();
  });
});

describe('todoChecklist', () => {
  const input = {
    todos: [
      { content: 'Write the test', activeForm: 'Writing the test', status: 'completed' },
      { content: 'Make it pass', activeForm: 'Making it pass', status: 'in_progress' },
      { content: 'Open the PR', activeForm: 'Opening the PR', status: 'pending' },
    ],
  };

  it('lists each item with its state, the one under way by its activeForm', () => {
    expect(todoChecklist('TodoWrite', input)).toEqual([
      { text: 'Write the test', status: 'completed' },
      { text: 'Making it pass', status: 'in_progress' },
      { text: 'Open the PR', status: 'pending' },
    ]);
  });

  it('reads an unknown state as pending and skips what is not an item', () => {
    expect(todoChecklist('TodoWrite', { todos: [{ content: 'a', status: 'odd' }, 'b'] })).toEqual([{ text: 'a', status: 'pending' }]);
  });

  it('is null for other tools and for a call with no list', () => {
    expect(todoChecklist('Bash', input)).toBeNull();
    expect(todoChecklist('TodoWrite', {})).toBeNull();
  });

  it('gives the summary as how much is done', () => {
    expect(toolSummary('TodoWrite', input)).toBe('1/3 done');
  });
});
