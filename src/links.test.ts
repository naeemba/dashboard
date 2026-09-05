import { describe, expect, it } from 'vitest';
import { isOpenableLink } from './links';

describe('isOpenableLink', () => {
  it('opens pages', () => {
    expect(isOpenableLink('https://example.com/docs')).toBe(true);
    expect(isOpenableLink('http://localhost:3000')).toBe(true);
  });

  it('refuses schemes that run something', () => {
    expect(isOpenableLink('javascript:alert(1)')).toBe(false);
    expect(isOpenableLink('file:///etc/passwd')).toBe(false);
    expect(isOpenableLink('mailto:someone@example.com')).toBe(false);
  });

  it('refuses a scheme that only starts like http', () => {
    expect(isOpenableLink('httpx://example.com')).toBe(false);
  });

  it('refuses a string that is not a url', () => {
    expect(isOpenableLink('not a link')).toBe(false);
  });
});
