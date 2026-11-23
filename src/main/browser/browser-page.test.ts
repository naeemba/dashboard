import { existsSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrowserState } from '../../shared/browser/browser';
import { temporaryFolder } from '../testing/temporary-folder';
import { browserPage, screenshotReadRule } from './browser-page';
import type { PagePorts } from './browser-views';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const browsers = new Map<string, BrowserState>([['/work/api', { tabs: [{ id: 4, url: 'about:blank', title: '', holder: '3:1' }], active: 4 }]]);

// A page answering each protocol method from `answers`, a picture unless told otherwise, and recording
// what it was sent. A method answered with an Error throws it, as the protocol does.
function fakePage(answers: Record<string, unknown>, folder = temporaryFolder('browser-page-')) {
  const sent: string[] = [];
  const pages: PagePorts = {
    async send(_id, method, parameters) {
      sent.push(`${method} ${JSON.stringify(parameters ?? {})}`);
      const answer = { 'Page.captureScreenshot': { data: 'cG5n' }, ...answers }[method];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    size: () => ({ width: 1280, height: 800 }),
    logOf: () => undefined,
  };
  return { sent, folder, page: browserPage(pages, () => browsers, folder, () => NOW) };
}

describe('read', () => {
  it('says a selector the page threw on with the exception, not the protocol\'s "Uncaught"', async () => {
    const { page } = fakePage({
      'Runtime.evaluate': { exceptionDetails: { text: 'Uncaught', exception: { description: 'SyntaxError: \'##\' is not valid\n    at <anonymous>' } } },
    });
    await expect(page.reads.read('3:1', 4, { maxTokens: null, selector: '##' }))
      .resolves.toEqual({ refused: '## is not a selector the page takes: SyntaxError: \'##\' is not valid' });
  });

  it('falls back to the exception\'s text, and refuses a selector that matched nothing', async () => {
    const thrown = fakePage({ 'Runtime.evaluate': { exceptionDetails: { text: 'Uncaught' } } });
    await expect(thrown.page.reads.read('3:1', 4, { maxTokens: null, selector: null }))
      .resolves.toEqual({ refused: 'tab 4\'s page could not be read: Uncaught' });
    const empty = fakePage({ 'Runtime.evaluate': { result: { value: { tree: null } } } });
    await expect(empty.page.reads.read('3:1', 4, { maxTokens: null, selector: 'main' }))
      .resolves.toEqual({ refused: 'nothing in tab 4 matches main' });
  });

  it('reads only a tab the pane holds', async () => {
    const { page, sent } = fakePage({});
    await expect(page.reads.read('3:2', 4, { maxTokens: null, selector: null })).resolves.toEqual({ refused: 'tab 4 is held by pane 3:1' });
    expect(sent).toEqual([]);
  });
});

describe('screenshot', () => {
  it('cuts a full page wider than any screen at 4000, and draws the viewport when the page has no size', async () => {
    const wide = fakePage({ 'Page.getLayoutMetrics': { cssContentSize: { width: 9000, height: 500 } }, 'Page.captureScreenshot': { data: 'cG5n' } });
    await wide.page.reads.screenshot('3:1', 4, { full: true, element: null });
    expect(wide.sent).toContain('Page.captureScreenshot {"format":"png","captureBeyondViewport":true,"clip":{"x":0,"y":0,"width":4000,"height":500,"scale":1}}');
    const flat = fakePage({ 'Page.getLayoutMetrics': { cssContentSize: { width: 0, height: 0 } } });
    await flat.page.reads.screenshot('3:1', 4, { full: true, element: null });
    expect(flat.sent).toEqual(['Page.getLayoutMetrics {}', 'Page.captureScreenshot {"format":"png"}']);
  });

  it('refuses an element with no height, and a picture with nothing in it', async () => {
    const flat = fakePage({ 'Runtime.evaluate': { result: { value: { x: 1.4, y: 2, width: 30, height: 0 } } } });
    await expect(flat.page.reads.screenshot('3:1', 4, { full: false, element: 'hr' })).resolves.toEqual({ refused: 'hr in tab 4 has no size on screen' });
    const blank = fakePage({ 'Page.captureScreenshot': { data: '' } });
    await expect(blank.page.reads.screenshot('3:1', 4, { full: false, element: null })).resolves.toEqual({ refused: 'tab 4 drew nothing to take a picture of' });
  });

  it('saves the picture in the folder, and clears out those older than a day', async () => {
    const { page, folder } = fakePage({});
    const old = path.join(folder, 'tab-1-old.png');
    writeFileSync(old, 'png');
    utimesSync(old, (NOW - 25 * 3600_000) / 1000, (NOW - 25 * 3600_000) / 1000);
    const recent = path.join(folder, 'tab-1-recent.png');
    writeFileSync(recent, 'png');
    utimesSync(recent, (NOW - 3600_000) / 1000, (NOW - 3600_000) / 1000);
    const file = await page.reads.screenshot('3:1', 4, { full: false, element: null });
    expect(existsSync(old)).toBe(false);
    expect(readdirSync(folder).sort()).toEqual([path.basename(String(file)), 'tab-1-recent.png'].sort());
  });
});

describe('type', () => {
  it('puts the caret at the end of the field before typing into it', async () => {
    const { page, sent } = fakePage({ 'DOM.resolveNode': { object: { objectId: 'field-1' } } });
    await page.ports.act(4, { kind: 'type', node: 7, text: ' red' });
    expect(sent.map((line) => line.split(' ')[0])).toEqual(['DOM.focus', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Input.insertText']);
  });

  it('says a node the page hid since the snapshot is stale, not the protocol\'s "not focusable"', async () => {
    const { page, sent } = fakePage({ 'DOM.focus': new Error('Element is not focusable') });
    await expect(page.ports.act(4, { kind: 'type', node: 7, text: 'red' }))
      .rejects.toThrow('the element is not on the page as the last snapshot saw it (Element is not focusable); take a new snapshot');
    expect(sent.map((line) => line.split(' ')[0])).toEqual(['DOM.focus']);
  });

  it('says a closed tab as itself, not as a stale ref', async () => {
    const { page } = fakePage({ 'DOM.focus': new Error('tab 4 is closed') });
    await expect(page.ports.act(4, { kind: 'type', node: 7, text: 'red' })).rejects.toThrow(/^tab 4 is closed$/);
  });
});

describe('emulate', () => {
  it('lays a page back out at its view\'s own size before clearing, so a hidden tab is not left a phone\'s width', async () => {
    const { page, sent } = fakePage({});
    await page.ports.emulate(4, null);
    expect(sent).toEqual([
      'Emulation.setDeviceMetricsOverride {"width":1280,"height":800,"deviceScaleFactor":0,"mobile":false}',
      'Emulation.clearDeviceMetricsOverride {}',
    ]);
  });

  it('lays a page out at the size asked for, and leaves it there', async () => {
    const { page, sent } = fakePage({});
    await page.ports.emulate(4, { width: 390, height: 844 });
    expect(sent).toEqual(['Emulation.setDeviceMetricsOverride {"width":390,"height":844,"deviceScaleFactor":0,"mobile":false}']);
  });
});

describe('screenshotReadRule', () => {
  it('names the folder as an absolute path, a Windows drive included', () => {
    expect(screenshotReadRule('/home/me/.config/Dashboard')).toBe('Read(//home/me/.config/Dashboard/browser-screenshots/**)');
    expect(screenshotReadRule('C:\\Users\\me\\AppData\\Roaming\\Dashboard')).toBe('Read(//c/Users/me/AppData/Roaming/Dashboard/browser-screenshots/**)');
  });
});
