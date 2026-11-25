import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { browserClick, browserEval, browserPress, browserResize, browserType, browserUpload } from './page';

const project = '/work/api';
const tabs = { [project]: { tabs: [{ id: 4, url: 'about:blank', title: '', holder: '3:1' }], active: 4 } };
const held = () => fakePorts(tabs, { e1: 101 });

describe('browser.resize', () => {
  it('lays the page out at a phone\'s size, then back as its view is', async () => {
    const ports = held();
    await expect(bind(browserResize, ports).call({ pane: '3:1', tab: 4, width: 390, height: 844 }))
      .resolves.toEqual({ output: 'tab 4 laid out at 390x844' });
    await expect(bind(browserResize, ports).call({ pane: '3:1', tab: 4 })).resolves.toEqual({ output: 'tab 4 is as its view is' });
    expect(ports.done).toEqual(['size 4 390x844', 'unsize 4']);
  });

  it('refuses a size out of reach, and a tab the pane does not hold', async () => {
    const ports = held();
    await expect(bind(browserResize, ports).call({ pane: '3:1', tab: 4, width: 20, height: 844 })).resolves.toHaveProperty('refused');
    await expect(bind(browserResize, ports).call({ pane: '3:2', tab: 4, width: 390, height: 844 }))
      .resolves.toEqual({ refused: 'tab 4 is held by pane 3:1' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.click and browser.type', () => {
  it('acts on the node the last snapshot named', async () => {
    const ports = held();
    await expect(bind(browserClick, ports).call({ pane: '3:1', tab: 4, ref: 'e1' })).resolves.toEqual({ output: 'clicked e1 in tab 4' });
    await bind(browserType, ports).call({ pane: '3:1', tab: 4, ref: 'e1', text: 'hello' });
    expect(ports.done).toEqual(['click 4 {"node":101}', 'type 4 {"node":101,"text":"hello"}']);
  });

  it('refuses a ref the snapshot did not hand out, and typing nothing', async () => {
    const ports = held();
    await expect(bind(browserClick, ports).call({ pane: '3:1', tab: 4, ref: 'e9' }))
      .resolves.toEqual({ refused: 'tab 4\'s last snapshot has no e9; take one with `browser snapshot 4`' });
    await expect(bind(browserType, ports).call({ pane: '3:1', tab: 4, ref: 'e1', text: '' })).resolves.toEqual({ refused: 'no text was given to type' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.press', () => {
  it('sends a named key to the page, or to an element first', async () => {
    const ports = held();
    await expect(bind(browserPress, ports).call({ pane: '3:1', tab: 4, key: 'enter' })).resolves.toEqual({ output: 'pressed Enter in tab 4' });
    await bind(browserPress, ports).call({ pane: '3:1', tab: 4, key: 'Tab', ref: 'e1' });
    expect(ports.done).toEqual([
      'press 4 {"key":{"key":"Enter","code":"Enter","keyCode":13,"text":"\\r"},"node":null}',
      'press 4 {"key":{"key":"Tab","code":"Tab","keyCode":9},"node":101}',
    ]);
  });

  it('refuses a key it does not know', async () => {
    await expect(bind(browserPress, held()).call({ pane: '3:1', tab: 4, key: 'Hyper' })).resolves.toHaveProperty('refused');
  });
});

describe('browser.upload', () => {
  // e1 takes one file, e2 many, and e3 is a text box.
  const form = () => fakePorts(tabs, { e1: 101, e2: 102, e3: 103 }, { 101: { multiple: false }, 102: { multiple: true } }, ['/me/cv.pdf', '/me/letter.pdf']);
  const upload = (ports: ReturnType<typeof form>, ref: string, files: unknown) => bind(browserUpload, ports).call({ pane: '3:1', tab: 4, ref, files });

  it('sets the files on the input the ref names', async () => {
    const ports = form();
    await expect(upload(ports, 'e1', ['/me/cv.pdf'])).resolves.toEqual({ output: 'put cv.pdf in e1 in tab 4' });
    await expect(upload(ports, 'e2', ['/me/cv.pdf', '/me/letter.pdf'])).resolves.toEqual({ output: 'put 2 files in e2 in tab 4' });
    expect(ports.done).toEqual(['upload 4 {"node":101,"files":["/me/cv.pdf"]}', 'upload 4 {"node":102,"files":["/me/cv.pdf","/me/letter.pdf"]}']);
  });

  it('refuses a ref that is no file input, a missing file, and two files on an input that takes one', async () => {
    const ports = form();
    await expect(upload(ports, 'e3', ['/me/cv.pdf'])).resolves.toEqual({ refused: 'e3 is not a file input; a snapshot lists those as file' });
    await expect(upload(ports, 'e1', ['/me/gone.pdf'])).resolves.toEqual({ refused: 'there is no file at /me/gone.pdf' });
    await expect(upload(ports, 'e1', ['/me/cv.pdf', '/me/letter.pdf'])).resolves.toEqual({ refused: 'e1 takes one file, and 2 were named' });
    await expect(upload(ports, 'e2', ['/me/cv.pdf', '/me/gone.pdf'])).resolves.toEqual({ refused: 'there is no file at /me/gone.pdf' });
    expect(ports.done).toEqual([]);
  });

  it('refuses no file, and a path that is not whole', async () => {
    const ports = form();
    await expect(upload(ports, 'e1', [])).resolves.toEqual({ refused: 'no file was named to upload' });
    await expect(upload(ports, 'e1', 'cv.pdf')).resolves.toEqual({ refused: 'no file was named to upload' });
    await expect(upload(ports, 'e1', ['cv.pdf'])).resolves.toEqual({ refused: 'cv.pdf is not a whole path' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.eval', () => {
  it('runs the script in a tab the pane holds, with no wait when no selector is given', async () => {
    const ports = held();
    await expect(bind(browserEval, ports).call({ pane: '3:1', tab: 4, script: 'document.title', waitFor: '  ' }))
      .resolves.toEqual({ output: 'tab 4\'s script answered nothing' });
    expect(ports.done).toEqual(['eval 4 {"script":"document.title","waitFor":null}']);
  });

  it('refuses an empty script, and a tab another pane holds', async () => {
    const ports = held();
    await expect(bind(browserEval, ports).call({ pane: '3:1', tab: 4, script: '\n' })).resolves.toEqual({ refused: 'the script is empty' });
    await expect(bind(browserEval, ports).call({ pane: '3:2', tab: 4, script: '1' })).resolves.toEqual({ refused: 'tab 4 is held by pane 3:1' });
    expect(ports.done).toEqual([]);
  });
});
