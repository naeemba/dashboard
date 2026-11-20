import { describe, expect, it } from 'vitest';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import type { BoundAction } from '../actions/action';
import { answered } from '../workers/session-cli';
import { BROWSER_REQUEST } from './browser-cli';
import { browserProject, browserRequests, type BrowserRequestPorts } from './browser-requests';

// Each action and read as a record of what it was called with.
function fakeDoor() {
  const calls: string[] = [];
  const bound = (name: string): BoundAction => ({
    name, words: [], call: async (raw) => { calls.push(`${name} ${JSON.stringify(raw)}`); return { output: `${name} done` }; },
  });
  const read = (name: string) => async (pane: string, tab: number, options: unknown) => {
    calls.push(`${name} ${pane} ${tab} ${JSON.stringify(options)}`);
    return name === 'screenshot' ? '/tmp/shot.png' : { refused: 'not yours' };
  };
  const ports: BrowserRequestPorts = {
    paneOpen: (pane) => ['2:1', `${MANAGER_SLOT}:0`].includes(pane),
    projectPath: (slot) => (slot === 2 ? '/work/api' : undefined),
    slotOf: (folder) => (folder === '/work/web' ? 3 : -1),
    actions: Object.fromEntries(['open', 'claim', 'release', 'navigate', 'step', 'resize', 'click', 'type', 'press']
      .map((name) => [name, bound(name)])) as BrowserRequestPorts['actions'],
    reads: {
      tabs: (pane, projectPath) => `tabs of ${projectPath} for ${pane}`,
      read: read('read'), screenshot: read('screenshot'), snapshot: read('snapshot'), console: read('console'), network: read('network'),
    },
  };
  const ask = browserRequests(ports, async () => answered('otherwise'));
  return { calls, ask: (pane: string, command: object) => ask({ directory: '/', args: [BROWSER_REQUEST, pane, JSON.stringify(command)] }) };
}

describe('browserRequests', () => {
  it('opens a tab for the pane in its own project, or the open project named', async () => {
    const door = fakeDoor();
    await door.ask('2:1', { verb: 'open', url: 'example.com', project: null });
    await door.ask('2:1', { verb: 'open', url: 'example.com', project: '/work/web' });
    expect(door.calls).toEqual([
      'open {"projectPath":"/work/api","url":"example.com","pane":"2:1"}',
      'open {"projectPath":"/work/web","url":"example.com","pane":"2:1"}',
    ]);
  });

  it('hands each verb on a tab to its action with the pane', async () => {
    const door = fakeDoor();
    await door.ask('2:1', { verb: 'back', tab: 4 });
    await door.ask('2:1', { verb: 'reset', tab: 4 });
    await door.ask('2:1', { verb: 'press', tab: 4, key: 'Enter', ref: null });
    expect(door.calls).toEqual([
      'step {"pane":"2:1","tab":4,"step":"back"}',
      'resize {"pane":"2:1","tab":4}',
      'press {"pane":"2:1","tab":4,"key":"Enter","ref":null}',
    ]);
  });

  it('answers a read with what it printed, or its refusal', async () => {
    const door = fakeDoor();
    await expect(door.ask('2:1', { verb: 'screenshot', tab: 4, full: true, element: null })).resolves.toEqual({ ok: true, output: '/tmp/shot.png' });
    await expect(door.ask('2:1', { verb: 'console', tab: 4 })).resolves.toEqual({ ok: false, output: 'not yours' });
    await expect(door.ask('2:1', { verb: 'tabs', project: null })).resolves.toEqual({ ok: true, output: 'tabs of /work/api for 2:1' });
  });

  it('refuses a pane the app does not have, before anything is done', async () => {
    const door = fakeDoor();
    await expect(door.ask('2:7', { verb: 'claim', tab: 4 })).resolves.toEqual({ ok: false, output: 'pane 2:7 is not open in this app' });
    await expect(door.ask('nobody', { verb: 'tabs', project: null })).resolves.toEqual({ ok: false, output: 'pane nobody is not open in this app' });
    expect(door.calls).toEqual([]);
  });

  it('says a read that failed, rather than failing the socket', async () => {
    const door = fakeDoor();
    const failing = browserRequests({
      ...({} as BrowserRequestPorts), paneOpen: () => true,
      reads: { snapshot: async () => { throw new Error('tab 4 is closed'); } } as unknown as BrowserRequestPorts['reads'],
    }, async () => answered('otherwise'));
    await expect(failing({ directory: '/', args: [BROWSER_REQUEST, '2:1', '{"verb":"snapshot","tab":4}'] }))
      .resolves.toEqual({ ok: false, output: 'tab 4 is closed' });
    await expect(door.ask('2:1', {})).resolves.toEqual({ ok: false, output: 'the browser request was not one the app could read' });
  });

  it('leaves every other request to the next door', async () => {
    const ask = browserRequests({} as BrowserRequestPorts, async () => answered('otherwise'));
    await expect(ask({ directory: '/', args: ['list'] })).resolves.toEqual({ ok: true, output: 'otherwise' });
  });
});

describe('browserProject', () => {
  const ports = { projectPath: (slot: number) => (slot === 2 ? '/work/api' : undefined), slotOf: (folder: string) => (folder === '/work/web' ? 3 : -1) };

  it('refuses the manager without --project, and a project that is not open', () => {
    expect(browserProject(ports, `${MANAGER_SLOT}:0`, null)).toEqual({ refused: 'the manager has no browser; name a project with --project' });
    expect(browserProject(ports, `${MANAGER_SLOT}:0`, '/work/web')).toBe('/work/web');
    expect(browserProject(ports, '2:1', '/work/gone')).toEqual({ refused: '/work/gone is not open in the app; `dashboard project open` it first' });
  });
});
