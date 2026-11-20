import { describe, expect, it } from 'vitest';
import { estimateTokens, readingText, readPage, shortLink, type ReaderNode } from './page-reader';

const page = (tree: ReaderNode | null) => ({ title: 'Pricing', url: 'https://example.com/pricing?plan=team', tree });

describe('readPage', () => {
  it('turns headings, paragraphs, lists, code and links into markdown under the title', () => {
    const tree: ReaderNode = ['main', [
      ['h1', ['Plans']],
      ['p', ['Pick ', ['strong', ['one']], ' of  the\n plans, or ', ['a', ['ask us'], 'https://example.com/contact'], '.']],
      ['ul', [['li', ['Free']], '\n', ['li', ['Team', ['ul', [['li', ['Five seats']]]]]]]],
      ['pre', ['npm i\n  example\n']],
      ['table', [['tr', [['th', ['Plan']], ['th', ['Price']]]], ['tr', [['td', ['Team']], ['td', ['$5']]]]]],
    ]];
    expect(readPage(page(tree), 4000).text).toBe([
      '# Pricing',
      'https://example.com/pricing?plan=team',
      '',
      '# Plans',
      '',
      'Pick **one** of the plans, or [ask us](/contact).',
      '',
      '- Free',
      '- Team',
      '  - Five seats',
      '',
      '```',
      'npm i',
      '  example',
      '```',
      '',
      '| Plan | Price |',
      '| Team | $5 |',
    ].join('\n'));
  });

  it('drops a link with no text, and keeps a script link\'s text alone', () => {
    const tree: ReaderNode = ['p', [['a', [], 'https://example.com/x'], ['a', ['Menu'], 'javascript:void(0)']]];
    expect(readPage(page(tree), 4000).text.split('\n').at(-1)).toBe('Menu');
  });

  it('cuts at the last line that fits the budget and says the whole was larger', () => {
    const tree: ReaderNode = ['div', Array.from({ length: 50 }, (_, place): ReaderNode => ['p', [`Paragraph ${place} `.repeat(4)]])];
    const reading = readPage(page(tree), 100);
    expect(reading.cut).toBe(true);
    expect(estimateTokens(reading.text)).toBeLessThanOrEqual(100);
    expect(reading.tokens).toBeGreaterThan(100);
    expect(reading.text.endsWith(' ')).toBe(false);
  });

  it('reads a page with nothing in it as its title and address', () => {
    expect(readPage(page(null), 4000)).toEqual({ text: '# Pricing\nhttps://example.com/pricing?plan=team', tokens: 12, cut: false });
  });
});

describe('shortLink', () => {
  const base = new URL('https://example.com/docs/a?x=1');

  it('is a path on the page\'s own site, the anchor alone on the same page', () => {
    expect(shortLink('https://example.com/docs/b', base)).toBe('/docs/b');
    expect(shortLink('https://example.com/docs/a?x=1#part', base)).toBe('#part');
  });

  it('keeps another site whole, cutting a long query string', () => {
    expect(shortLink('https://other.org/a?q=1', base)).toBe('https://other.org/a?q=1');
    expect(shortLink(`https://other.org/a?utm=${'x'.repeat(60)}`, base)).toBe('https://other.org/a?…');
  });
});

describe('readingText', () => {
  it('reports the token estimate first, and the cut', () => {
    expect(readingText(3, { text: '# T', tokens: 1, cut: false }, 4000)).toBe('tab 3: ~1 tokens\n\n# T');
    expect(readingText(3, { text: '# T', tokens: 9000, cut: true }, 4000).split('\n')[0])
      .toBe('tab 3: ~4000 of ~9000 tokens; cut, so --max-tokens or --selector for the rest');
  });
});
