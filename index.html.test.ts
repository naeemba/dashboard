import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The window's Content-Security-Policy, read from the meta tag as a map of directive to sources.
function policy(): Map<string, string[]> {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const content = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
  return new Map(content.split(';').map((directive) => {
    const [name = '', ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
}

describe('the window Content-Security-Policy', () => {
  it('runs only the app\'s own scripts', () => {
    expect(policy().get('script-src')).toEqual(["'self'"]);
    expect(policy().get('object-src')).toEqual(["'none'"]);
  });

  it('draws no image from the network', () => {
    expect(policy().get('img-src')?.some((source) => /^(https?:|\*)/.test(source))).toBe(false);
  });

  it('lets the PDF viewer fetch its data: URL and frame its blob', () => {
    expect(policy().get('connect-src')).toContain('data:');
    expect(policy().get('frame-src')).toContain('blob:');
  });
});
