import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeImage, safeLink } from './chat-markdown';

describe('renderMarkdown', () => {
  it('draws a pipe table as a table', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('highlights a fenced block in a language it knows', () => {
    expect(renderMarkdown('```ts\nconst x = 1;\n```')).toContain('hljs-keyword');
  });

  it('escapes a block in a language it does not know', () => {
    expect(renderMarkdown('```nosuch\n<b>\n```')).toContain('&#60;b&#62;');
  });

  it('shows raw HTML as text', () => {
    const html = renderMarkdown('look <img src=x onerror=alert(1)> here');
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img');
  });

  it('drops a javascript link and keeps its words', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('href');
    expect(html).toContain('click');
  });

  it('keeps a web link', () => {
    expect(renderMarkdown('[docs](https://example.com/a)')).toContain('<a href="https://example.com/a">docs</a>');
  });
});

describe('safeLink', () => {
  it('refuses a relative path', () => expect(safeLink('src/main.ts')).toBeNull());
  it('refuses file:', () => expect(safeLink('file:///etc/passwd')).toBeNull());
  it('takes mailto:', () => expect(safeLink('mailto:a@b.c')).toBe('mailto:a@b.c'));
});

describe('safeImage', () => {
  it('takes an inline png', () => expect(safeImage('data:image/png;base64,iVBORw0=')).not.toBeNull());
  it('refuses inline svg, which can carry script', () => {
    expect(safeImage('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
  });
  it('refuses a plain http image', () => expect(safeImage('http://example.com/a.png')).toBeNull());
  it('refuses the disk', () => expect(safeImage('file:///Users/me/a.png')).toBeNull());
});
