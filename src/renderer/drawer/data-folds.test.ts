import { describe, expect, it } from 'vitest';
import { allToggled, dataKey, dataStep, dataView, enclosingHeader, FOLD_SIZE_LIMIT, OPEN_LINE_LIMIT, shownLines, splitLines, startClosed, walkedRows } from './data-folds';

const YAML = [
  '# projects',      // 0
  'a:',              // 1
  '  b: 1',          // 2
  '  c: [1,',        // 3
  '    2]',          // 4
  'd:',              // 5
  '- x: 1',          // 6
  '  y: 2',          // 7
  '- z',             // 8
  'e: { f: 1 }',     // 9
  '',
].join('\n');

describe('dataView', () => {
  it('folds every YAML mapping and sequence that spans lines, under the line naming it, never the root', () => {
    expect([...dataView(YAML, 'yaml').folds.values()]).toEqual([
      { header: 1, to: 4 },
      // c's flow sequence hides nothing: all but its closing line is its header.
      { header: 5, to: 8 },
      { header: 6, to: 7 },
    ]);
  });

  it('pretty-prints JSON with two spaces and keeps each closing bracket in sight', () => {
    const view = dataView('{"a":{"b":[1,2]},"c":{}}', 'json');
    expect(view.lines.map((line) => line.replace(/<[^>]+>/g, ''))).toEqual([
      '{', '  &quot;a&quot;: {', '    &quot;b&quot;: [', '      1,', '      2', '    ]', '  },', '  &quot;c&quot;: {}', '}',
    ]);
    expect([...view.folds.values()]).toEqual([{ header: 1, to: 5 }, { header: 2, to: 4 }]);
    expect(view.failure).toBeNull();
  });

  it('shows a doc that does not parse as plain text with one line saying where', () => {
    const json = dataView('{\n "a": 1,\n}', 'json');
    expect(json.folds.size).toBe(0);
    expect(json.lines).toEqual(['{', ' &#34;a&#34;: 1,', '}']);
    expect(json.failure).toMatch(/^Not valid JSON: .*position 11/);
    const yaml = dataView('a: [1,\nb: 2\n', 'yaml');
    expect(yaml.failure).toMatch(/^Not valid YAML: .*at line 2, column 1:$/);
  });

  it('folds a sequence item under its `-`, the item before the key on the same line', () => {
    expect([...dataView('x:\n  - a:\n      b: 1\n    c: 2\n  - d\n', 'yaml').folds.values()])
      .toEqual([{ header: 0, to: 4 }, { header: 1, to: 3 }]);
    expect([...dataView('x:\n  -\n    a: 1\n    b: 2\n', 'yaml').folds.values()])
      .toEqual([{ header: 0, to: 3 }, { header: 1, to: 3 }]);
  });

  it('shows a doc past the size limit as written, with no folds', () => {
    const view = dataView(`{"a": [${'1,'.repeat(FOLD_SIZE_LIMIT / 2)}1]}`, 'json');
    expect(view.folds.size).toBe(0);
    expect(view.lines).toHaveLength(1);
    expect(view.failure).toMatch(/^Too large to fold/);
  });

  it('reads every document of a multi-document YAML file', () => {
    expect([...dataView('a:\n  b: 1\n---\nc:\n  d: 2\n', 'yaml').folds.values()]).toEqual([{ header: 0, to: 1 }, { header: 3, to: 4 }]);
  });
});

describe('splitLines', () => {
  it('closes a span left open at a line break and opens it again on the next line', () => {
    expect(splitLines('<span class="s">|\n  text\n</span>x')).toEqual(['<span class="s">|</span>', '<span class="s">  text</span>', '<span class="s"></span>x']);
  });
});

describe('folding', () => {
  const view = dataView(YAML, 'yaml');

  it('hides what a closed fold covers, the folds inside it too', () => {
    expect(shownLines(view, new Set([1, 6]))).toEqual([0, 1, 5, 6, 8, 9, 10]);
    expect(shownLines(view, new Set())).toHaveLength(11);
  });

  it('opens a long doc with every fold closed and a short one with all open', () => {
    expect(startClosed(view)).toEqual(new Set());
    const long = dataView(`a:\n${'  - 1\n'.repeat(OPEN_LINE_LIMIT)}`, 'yaml');
    expect(startClosed(long)).toEqual(new Set([0]));
  });

  it('closes all while any is open, and opens all once every one is closed', () => {
    expect(allToggled(view, new Set([1]))).toEqual(new Set([1, 5, 6]));
    expect(allToggled(view, allToggled(view, new Set()))).toEqual(new Set());
  });

  it('finds the innermost fold a line sits in', () => {
    expect(enclosingHeader(view, 6)).toBe(5);
    expect(enclosingHeader(view, 7)).toBe(6);
    expect(enclosingHeader(view, 1)).toBeNull();
  });

  it('maps the arrows and the fold-all key, and ignores them modified', () => {
    expect(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'a', 'x'].map((key) => dataKey(key, false, true)))
      .toEqual(['next', 'previous', 'open', 'close', 'all', 'ignore']);
    expect(dataKey('a', true, true)).toBe('ignore');
    // With nothing to fold the arrows are left to scroll the doc.
    expect(dataKey('ArrowDown', false, false)).toBe('ignore');
  });

  it('walks the Edit row and the fold lines in sight, round', () => {
    expect(walkedRows(view, new Set([1, 5]), true)).toEqual(['edit', 1, 5]);
    expect(dataStep(view, new Set(), true, 6, 'next').current).toBe('edit');
    expect(dataStep(view, new Set(), true, 'edit', 'previous').current).toBe(6);
    expect(dataStep(view, new Set(), false, null, 'previous').current).toBe(6);
    expect(dataStep(view, new Set(), false, null, 'next').current).toBe(1);
  });

  it('opens with Right, closes with Left, and steps out with Left on a closed fold', () => {
    expect(dataStep(view, new Set([5]), true, 5, 'open')).toEqual({ closed: new Set(), current: 5 });
    expect(dataStep(view, new Set(), true, 6, 'close')).toEqual({ closed: new Set([6]), current: 6 });
    expect(dataStep(view, new Set([6]), true, 6, 'close')).toEqual({ closed: new Set([6]), current: 5 });
    expect(dataStep(view, new Set(), true, 'edit', 'open')).toEqual({ closed: new Set(), current: 'edit' });
    expect(dataStep(view, new Set([5]), true, 5, 'toggle')).toEqual({ closed: new Set(), current: 5 });
    expect(dataStep(view, new Set(), true, 5, 'toggle')).toEqual({ closed: new Set([5]), current: 5 });
    expect(dataStep(view, new Set(), true, 'edit', 'toggle')).toEqual({ closed: new Set(), current: 'edit' });
  });

  it('moves the highlight out to a fold in sight when folding all hides it', () => {
    expect(dataStep(view, new Set(), true, 6, 'all')).toEqual({ closed: new Set([1, 5, 6]), current: 5 });
  });
});
