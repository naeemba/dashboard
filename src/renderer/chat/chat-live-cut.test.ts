import { describe, expect, it } from 'vitest';
import { liveCut } from './chat-live-cut';
import { renderMarkdown } from './chat-markdown';

const REPLY = [
  '# Plan', '', 'First a paragraph with a [link](https://example.com/a) and `code`.', '',
  '| a | b |', '|---|---|', '| 1 | 2 |', '',
  '```ts', 'const x = 1;', '', 'Not a cut: inside the fence.', '```', '',
  '- loose', '', '- list', '', '  more of the second item', '',
  '1. one', '', '2. two', '', '> quote', '', 'quote over', '',
  '    indented code', '', 'After the [second link', 'across a line](https://example.com/b).', '',
  '~~~', 'tilde fence', '', '```', 'still inside', '~~~', '', 'The end.',
].join('\n');

describe('liveCut', () => {
  it('draws every prefix of a reply, cut where it says, as the finished reply draws whole', () => {
    const whole = renderMarkdown(REPLY);
    let cuts = 0;
    for (let length = 1; length <= REPLY.length; length++) {
      const cut = liveCut(REPLY.slice(0, length));
      expect(cut).not.toBeNull();
      if (!cut) continue;
      cuts++;
      expect(renderMarkdown(REPLY.slice(0, cut)) + renderMarkdown(REPLY.slice(cut))).toBe(whole);
    }
    expect(cuts).toBeGreaterThan(REPLY.length / 2);
  });

  it('finds the same cut reading on from an earlier one', () => {
    let from = 0;
    for (let length = 1; length <= REPLY.length; length++) {
      const text = REPLY.slice(0, length);
      from = liveCut(text, from) ?? 0;
      expect(from).toBe(liveCut(text));
    }
  });

  it('never cuts inside an open fence', () => {
    expect(liveCut('a\n\n```\nx\n\ny\n\nz')).toBe(3);
  });

  it('refuses to cut a reply with a link definition or raw HTML', () => {
    expect(liveCut('see [a]\n\nmore\n\n[a]: https://example.com')).toBeNull();
    expect(liveCut('a\n\n<!--\n\nb\n-->')).toBeNull();
  });
});
