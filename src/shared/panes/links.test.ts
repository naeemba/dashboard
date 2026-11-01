import { describe, expect, it } from 'vitest';
import { dismissesViewer, frameNavigation, isOpenableLink } from './links';

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

describe('frameNavigation', () => {
  it('keeps the PDF and the viewer pages in the frame', () => {
    expect(frameNavigation('blob:file:///3f2a-41c0')).toBe('allow');
    expect(frameNavigation('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html')).toBe('allow');
  });

  it('sends a page link to the browser', () => {
    expect(frameNavigation('https://vendor.example.com/datasheet')).toBe('browser');
  });

  it('drops every other scheme', () => {
    expect(frameNavigation('file:///etc/passwd')).toBe('refuse');
    expect(frameNavigation('javascript:alert(1)')).toBe('refuse');
  });
});

describe('dismissesViewer', () => {
  const escape = { type: 'keyDown', key: 'Escape', shift: false, control: false, alt: false, meta: false };

  it('puts the viewer away on a bare Escape', () => {
    expect(dismissesViewer(escape)).toBe(true);
  });

  it('leaves a modified Escape, the key coming up and other keys alone', () => {
    expect(dismissesViewer({ ...escape, shift: true })).toBe(false);
    expect(dismissesViewer({ ...escape, type: 'keyUp' })).toBe(false);
    expect(dismissesViewer({ ...escape, key: 'Enter' })).toBe(false);
  });
});
