import { describe, expect, it } from 'vitest';
import { dismissesViewer, frameNavigation, isOpenableLink, windowMayNavigate } from './links';

describe('windowMayNavigate', () => {
  it("lets the dev server reload its own page", () => {
    expect(windowMayNavigate('http://127.0.0.1:5173/', 'http://127.0.0.1:5173')).toBe(true);
    expect(windowMayNavigate('http://127.0.0.1:5173/?t=1', 'http://127.0.0.1:5173')).toBe(true);
  });

  it('keeps every other address out under the dev server', () => {
    expect(windowMayNavigate('https://example.com/', 'http://127.0.0.1:5173')).toBe(false);
    expect(windowMayNavigate('http://127.0.0.1:5174/', 'http://127.0.0.1:5173')).toBe(false);
    expect(windowMayNavigate('http://localhost:5173/', 'http://127.0.0.1:5173')).toBe(false);
  });

  it('refuses every navigation in a packaged app', () => {
    expect(windowMayNavigate('file:///C:/Program%20Files/Dashboard/index.html', undefined)).toBe(false);
    expect(windowMayNavigate('https://example.com/', undefined)).toBe(false);
  });
});

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
    expect(frameNavigation('blob:file:///3f2a-41c0', false)).toBe('allow');
    expect(frameNavigation('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html', false)).toBe('allow');
  });

  it('sends a page link to the browser', () => {
    expect(frameNavigation('https://vendor.example.com/datasheet', false)).toBe('browser');
  });

  it('drops every other scheme', () => {
    expect(frameNavigation('file:///etc/passwd', false)).toBe('refuse');
    expect(frameNavigation('javascript:alert(1)', false)).toBe('refuse');
  });

  it("leaves the window's own frame to will-navigate", () => {
    expect(frameNavigation('http://127.0.0.1:5173/', true)).toBe('allow');
    expect(frameNavigation('file:///C:/Program%20Files/Dashboard/index.html', true)).toBe('allow');
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
