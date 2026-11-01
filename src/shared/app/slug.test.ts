import { describe, expect, it } from 'vitest';
import { slug } from './slug';

describe('slug', () => {
  it('lower-cases and joins the words with one hyphen', () => {
    expect(slug('Fix the  Footer, v2!')).toBe('fix-the-footer-v2');
  });

  it('trims the hyphens off both ends', () => {
    expect(slug('--My "API"--')).toBe('my-api');
  });

  it('leaves nothing for a name with no Latin letters or digits', () => {
    expect(slug('پروژه')).toBe('');
  });
});
