import { describe, expect, it } from 'vitest';
import { lineDiff, toolDiff, toolSummary } from './chat-tools';

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
      { sign: ' ', text: '…' },
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

  it('has nothing to show for a Bash call', () => {
    expect(toolDiff('Bash', { command: 'ls' })).toBeNull();
  });
});
