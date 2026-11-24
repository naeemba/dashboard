import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrowserState } from '../../shared/browser/browser';
import { temporaryFolder } from '../testing/temporary-folder';
import { browserPage, browserFileReadRule } from './browser-page';
import { PageTimeout, type PagePorts } from './browser-views';

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

describe('click', () => {
  it('says a node the page hid since the snapshot is stale when scrolling to it fails', async () => {
    const { page, sent } = fakePage({ 'DOM.scrollIntoViewIfNeeded': new Error('Node does not have a layout object') });
    await expect(page.ports.act(4, { kind: 'click', node: 7 }))
      .rejects.toThrow('the element is not on the page as the last snapshot saw it (Node does not have a layout object); take a new snapshot');
    expect(sent.map((line) => line.split(' ')[0])).toEqual(['DOM.scrollIntoViewIfNeeded']);
  });

  it.each(['Element is not focusable', 'Could not compute box model.', 'Node does not have a layout object', 'No node with given id found', 'Node is detached from document', 'Could not find node with given id'])(
    'says the protocol\'s "%s" as a stale ref', async (message) => {
      const { page } = fakePage({ 'DOM.scrollIntoViewIfNeeded': new Error(message) });
      await expect(page.ports.act(4, { kind: 'click', node: 7 })).rejects.toThrow(/take a new snapshot$/);
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

describe('runScript', () => {
  it('waits for the selector, then saves the answer and prints where', async () => {
    const { page, sent, folder } = fakePage({ 'Runtime.evaluate': { result: { value: true } } });
    const said = await page.ports.runScript(4, 'await 1; document.title', '.job');
    const file = path.join(folder, 'tab-4-2026-11-20T12-00-00-000Z.json');
    expect(said).toBe(`tab 4's script answered 4 characters: ${file}`);
    expect(readFileSync(file, 'utf8')).toBe('true');
    expect(sent[0]).toMatch(/^Runtime\.evaluate .*\(\\".job\\", 10000\)/);
    expect(sent[1]).toBe('Runtime.evaluate {"expression":"await 1; document.title","returnByValue":true,"awaitPromise":true,"replMode":true}');
  });

  it('saves a string as it is, anything else as JSON, and answers nothing for undefined', async () => {
    const titled = fakePage({ 'Runtime.evaluate': { result: { value: 'Engineer' } } });
    await expect(titled.page.ports.runScript(4, 'document.title', null))
      .resolves.toBe(`tab 4's script answered 8 characters: ${path.join(titled.folder, 'tab-4-2026-11-20T12-00-00-000Z.txt')}`);
    const listed = fakePage({ 'Runtime.evaluate': { result: { value: [{ title: 'Engineer' }] } } });
    const said = await listed.page.ports.runScript(4, 'jobs()', null);
    expect(readFileSync(String(said).split(': ')[1], 'utf8')).toBe('[\n  {\n    "title": "Engineer"\n  }\n]');
    const quiet = fakePage({ 'Runtime.evaluate': { result: { type: 'undefined' } } });
    await expect(quiet.page.ports.runScript(4, 'void 0', null)).resolves.toBe('tab 4\'s script answered nothing');
    expect(existsSync(quiet.folder) && readdirSync(quiet.folder).length > 0).toBe(false);
  });

  it('refuses a selector that never matched, and says what the script threw', async () => {
    const waited = fakePage({ 'Runtime.evaluate': { result: { value: false } } });
    await expect(waited.page.ports.runScript(4, '1', '.job')).resolves.toEqual({ refused: 'nothing in tab 4 matched .job in 10 seconds' });
    expect(waited.sent).toHaveLength(1);
    const thrown = fakePage({ 'Runtime.evaluate': { exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: jobs is not defined\n    at <anonymous>' } } } });
    await expect(thrown.page.ports.runScript(4, 'jobs()', null)).resolves.toEqual({ refused: 'tab 4\'s script threw: ReferenceError: jobs is not defined' });
  });

  it('saves a value JSON cannot carry as its text', async () => {
    const { page, folder } = fakePage({ 'Runtime.evaluate': { result: { type: 'number', unserializableValue: 'NaN' } } });
    await expect(page.ports.runScript(4, '0 / 0', null))
      .resolves.toBe(`tab 4's script answered 3 characters: ${path.join(folder, 'tab-4-2026-11-20T12-00-00-000Z.txt')}`);
  });

  it('saves a null as JSON, not as no answer', async () => {
    const { page, folder } = fakePage({ 'Runtime.evaluate': { result: { type: 'object', subtype: 'null', value: null } } });
    const file = path.join(folder, 'tab-4-2026-11-20T12-00-00-000Z.json');
    await expect(page.ports.runScript(4, 'localStorage.getItem("theme")', null)).resolves.toBe(`tab 4's script answered 4 characters: ${file}`);
    expect(readFileSync(file, 'utf8')).toBe('null');
  });

  it('stops a script still running when the protocol gives up waiting, a throwaway script after it', async () => {
    const { page, sent } = fakePage({ 'Runtime.evaluate': new PageTimeout(4, 'Runtime.evaluate', 15) });
    await expect(page.ports.runScript(4, 'for (;;) {}', null)).resolves.toEqual({
      refused: 'tab 4\'s script did not answer in 15 seconds: one still running was stopped,'
        + ' but one awaiting a timer or promise was not, and `browser reload` ends it',
    });
    expect(sent.slice(1)).toEqual(['Runtime.terminateExecution {}', 'Runtime.evaluate {"expression":"0"}']);
  });
});

describe('browserFileReadRule', () => {
  it('names the folder as an absolute path, a Windows drive included', () => {
    expect(browserFileReadRule('/home/me/.config/Dashboard')).toBe('Read(//home/me/.config/Dashboard/browser-files/**)');
    expect(browserFileReadRule('C:\\Users\\me\\AppData\\Roaming\\Dashboard')).toBe('Read(//c/Users/me/AppData/Roaming/Dashboard/browser-files/**)');
  });
});
