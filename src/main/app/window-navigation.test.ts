import { describe, expect, it } from 'vitest';
import { dismissesViewer, frameNavigation, windowMayNavigate } from './window-navigation';

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

describe('frameNavigation', () => {
  const viewerFrame = { isMainFrame: false, isWindowContents: true, isBrowserTab: false };
  const windowFrame = { isMainFrame: true, isWindowContents: true, isBrowserTab: false };

  it('keeps the PDF and the viewer pages in the frame', () => {
    expect(frameNavigation('blob:file:///3f2a-41c0', viewerFrame)).toBe('allow');
    expect(frameNavigation('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html', viewerFrame)).toBe('allow');
  });

  it('sends a page link to the browser', () => {
    expect(frameNavigation('https://vendor.example.com/datasheet', viewerFrame)).toBe('browser');
  });

  it('drops every other scheme', () => {
    expect(frameNavigation('file:///etc/passwd', viewerFrame)).toBe('refuse');
    expect(frameNavigation('javascript:alert(1)', viewerFrame)).toBe('refuse');
  });

  it("leaves the window's main frame to will-navigate", () => {
    expect(frameNavigation('http://127.0.0.1:5173/', windowFrame)).toBe('allow');
    expect(frameNavigation('file:///C:/Program%20Files/Dashboard/index.html', windowFrame)).toBe('allow');
  });

  it("judges a viewer's own main frame like any other", () => {
    const ownContents = { isMainFrame: true, isWindowContents: false, isBrowserTab: false };
    expect(frameNavigation('https://vendor.example.com/datasheet', ownContents)).toBe('browser');
    expect(frameNavigation('blob:file:///3f2a-41c0', ownContents)).toBe('allow');
  });
});

describe("frameNavigation in a browser tab", () => {
  const tabFrame = { isMainFrame: true, isWindowContents: false, isBrowserTab: true };
  const tabSubframe = { ...tabFrame, isMainFrame: false };

  it('keeps a web page, a dev server and an empty frame in the tab', () => {
    expect(frameNavigation('https://github.com/owner/repo/pull/3', tabFrame)).toBe('allow');
    expect(frameNavigation('http://localhost:5173/', tabFrame)).toBe('allow');
    expect(frameNavigation('https://www.youtube.com/embed/x', tabSubframe)).toBe('allow');
    expect(frameNavigation('about:blank', tabSubframe)).toBe('allow');
  });

  it('refuses a mail link, a file and a script', () => {
    expect(frameNavigation('mailto:someone@example.com', tabFrame)).toBe('refuse');
    expect(frameNavigation('file:///etc/passwd', tabFrame)).toBe('refuse');
    expect(frameNavigation('javascript:alert(1)', tabSubframe)).toBe('refuse');
  });

  it('never lets a web page into the PDF viewer or a contents that is not a tab', () => {
    expect(frameNavigation('https://example.com/', { ...tabFrame, isBrowserTab: false })).toBe('browser');
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
