import { describe, expect, it } from 'vitest';
import { liveCut, liveStep } from './chat-live-cut';
import { renderMarkdown } from './chat-markdown';

const REPLY = [
  '# Plan', '', '**Bold** opens a paragraph.', '', '*emphasis* too, and --- a rule:', '', '---', '', '<br>', '', 'First a paragraph with a [link](https://example.com/a) and `code`.', '',
  '| a | b |', '|---|---|', '| 1 | 2 |', '',
  '```ts', 'const x = 1;', '', 'Not a cut: inside the fence.', '```', '',
  '- loose', '', '- list', '', '  more of the second item', '',
  '1. one', '', '2. two', '', '> quote', '', 'quote over', '',
  '    indented code', '', 'After the [second link', 'across a line](https://example.com/b).', '',
  '~~~', 'tilde fence', '', '```', 'still inside', '~~~', '', 'The end.',
].join('\n');

describe('liveCut', () => {
  it('reads a long run of container markers in linear time', () => {
    const start = performance.now();
    for (const line of ['*' + '  *'.repeat(20000) + 'x', '>' + ' >'.repeat(20000) + 'x']) liveCut(`a\n\n${line}`);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('draws every prefix of a reply, cut where it says, as the finished reply draws whole', () => {
    const whole = renderMarkdown(REPLY);
    let from = 0;
    let cuts = 0;
    for (let length = 1; length <= REPLY.length; length++) {
      const text = REPLY.slice(0, length);
      const cut = liveCut(text);
      expect(liveCut(text, from)).toBe(cut);
      from = cut ?? 0;
      if (!cut) continue;
      cuts++;
      expect(renderMarkdown(REPLY.slice(0, cut)) + renderMarkdown(REPLY.slice(cut))).toBe(whole);
    }
    expect(cuts).toBeGreaterThan(REPLY.length / 2);
  });

  it('draws every prefix the same cut as whole when a fence or definition sits in a container', () => {
    const replies = [
      '- ```\n  x\n  ```\n\npara\n\n```\ncode\n\nmore\n```\n\nend',
      '1. Run:\n   ```py\n   x = 1\n\ny = 2\n   ```\n\npara\n\nend',
      'see [a]\n\nmore\n\n- [a]: https://example.com',
      'see [a]\n\nmore\n\n> [a]: https://example.com',
      '``` a`b\n\npara\n\n```\ncode\n\nmore\n```\n\nend',
    ];
    for (const reply of replies) {
      for (let length = 1; length <= reply.length; length++) {
        const text = reply.slice(0, length);
        const cut = liveCut(text);
        if (cut) expect(renderMarkdown(text.slice(0, cut)) + renderMarkdown(text.slice(cut)), text).toBe(renderMarkdown(text));
      }
    }
    expect(liveCut(replies[2])).toBeNull();
    expect(liveCut(replies[3])).toBeNull();
  });

  it('never cuts inside an open fence', () => {
    expect(liveCut('a\n\n```\nx\n\ny\n\nz')).toBe(3);
  });

  it('refuses to cut a reply with a link definition or raw HTML', () => {
    expect(liveCut('see [a]\n\nmore\n\n[a]: https://example.com')).toBeNull();
    expect(liveCut('a\n\n<!--\n\nb\n-->')).toBeNull();
    expect(liveCut('a\n\n<PRE>\n\nb')).toBeNull();
  });

  it('cuts after an HTML line that ends at a blank line', () => {
    expect(liveCut('a\n\n<br>\n\nb')).toBe(9);
  });
});

describe('liveStep', () => {
  it('settles each newly cut paragraph once and redraws only the rest', () => {
    const first = liveStep('', 0, 'a\n\nb');
    expect(first).toEqual({ clear: false, settle: 'a\n\n', tail: 'b', settled: 3 });
    expect(liveStep('a\n\nb', 3, 'a\n\nbc')).toEqual({ clear: false, settle: '', tail: 'bc', settled: 3 });
  });

  it('starts again for a new block', () => {
    expect(liveStep('a\n\nb', 3, 'x')).toEqual({ clear: true, settle: '', tail: 'x', settled: 0 });
  });

  it('draws a reply that cannot be cut whole, dropping what was settled', () => {
    expect(liveStep('a\n\nb', 3, 'a\n\nb\n\n[b]: https://example.com')).toEqual({
      clear: true, settle: '', tail: 'a\n\nb\n\n[b]: https://example.com', settled: 0,
    });
  });
});
