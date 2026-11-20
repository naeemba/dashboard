import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { browserNavigate, browserStep } from './navigate';

const project = '/work/api';
const open = () => fakePorts({ [project]: { tabs: [{ id: 4, url: 'about:blank', title: '', holder: 'user' }], active: 4 } });

describe('browser.navigate', () => {
  it('loads the address in the tab on screen', async () => {
    const ports = open();
    await expect(bind(browserNavigate, ports).call({ projectPath: project, url: 'localhost:5173' }))
      .resolves.toEqual({ output: 'tab 4 to http://localhost:5173' });
    expect(ports.done).toEqual(['load 4 http://localhost:5173']);
    expect(ports.browsers.get(project)?.tabs[0].url).toBe('http://localhost:5173');
  });

  it('refuses a project with no tab, and an address that is not a web page', async () => {
    await expect(bind(browserNavigate, fakePorts()).call({ projectPath: project, url: 'example.com' }))
      .resolves.toEqual({ refused: 'this project has no tab open' });
    const ports = open();
    await expect(bind(browserNavigate, ports).call({ projectPath: project, url: 'javascript:alert(1)' }))
      .resolves.toHaveProperty('refused');
    expect(ports.done).toEqual([]);
  });
});

describe('browser.navigate for an agent', () => {
  const agents = () => fakePorts({ [project]: { tabs: [{ id: 4, url: 'about:blank', title: '', holder: 'user' }, { id: 5, url: 'about:blank', title: '', holder: '3:1' }], active: 4 } });

  it('loads the address in the tab the pane holds, not the one on screen', async () => {
    const ports = agents();
    await expect(bind(browserNavigate, ports).call({ pane: '3:1', tab: '5', url: 'localhost:3000' }))
      .resolves.toEqual({ output: 'tab 5 to http://localhost:3000' });
    expect(ports.done).toEqual(['load 5 http://localhost:3000']);
  });

  it('refuses the user\'s tab, loading nothing', async () => {
    const ports = agents();
    await expect(bind(browserNavigate, ports).call({ pane: '3:1', tab: 4, url: 'example.com' }))
      .resolves.toEqual({ refused: 'tab 4 is the user\'s; `browser claim 4` it first' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.step', () => {
  it('goes back, forward or loads again in the tab on screen', async () => {
    const ports = open();
    await bind(browserStep, ports).call({ projectPath: project, step: 'back' });
    await bind(browserStep, ports).call({ projectPath: project, step: 'reload' });
    expect(ports.done).toEqual(['back 4', 'reload 4']);
  });

  it('steps the tab an agent holds', async () => {
    const ports = fakePorts({ [project]: { tabs: [{ id: 5, url: 'about:blank', title: '', holder: '3:1' }], active: 5 } });
    await bind(browserStep, ports).call({ pane: '3:1', tab: 5, step: 'forward' });
    expect(ports.done).toEqual(['forward 5']);
  });

  it('refuses a step it does not know', async () => {
    const ports = open();
    await expect(bind(browserStep, ports).call({ projectPath: project, step: 'home' }))
      .resolves.toEqual({ refused: 'a step is back, forward, reload' });
    expect(ports.done).toEqual([]);
  });
});
