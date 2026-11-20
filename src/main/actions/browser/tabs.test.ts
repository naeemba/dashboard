import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { browserClose, browserOpen, browserSwitch } from './tabs';

const tab = (id: number, url = 'about:blank') => ({ id, url, title: '', holder: 'user' });
const project = '/work/api';

describe('browser.open', () => {
  it('opens a tab for you at the address, on screen', async () => {
    const ports = fakePorts();
    await expect(bind(browserOpen, ports).call({ projectPath: project, url: 'example.com' }))
      .resolves.toEqual({ output: 'opened tab 11', tab: 11 });
    expect(ports.done).toEqual(['make 11 https://example.com in /work/api']);
    expect(ports.browsers.get(project)).toEqual({ tabs: [tab(11, 'https://example.com')], active: 11 });
  });

  it('opens an empty tab with no address', async () => {
    const ports = fakePorts();
    await bind(browserOpen, ports).call({ projectPath: project });
    expect(ports.done).toEqual(['make 11 about:blank in /work/api']);
  });

  it('refuses what is not a web page, making nothing', async () => {
    const ports = fakePorts();
    await expect(bind(browserOpen, ports).call({ projectPath: project, url: 'file:///etc/passwd' }))
      .resolves.toEqual({ refused: 'file:///etc/passwd is not a web page' });
    await expect(bind(browserOpen, ports).call({ url: 'example.com' })).resolves.toEqual({ refused: 'no project folder was given' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.close', () => {
  it('drops the view and hands the screen on', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1), tab(2)], active: 1 } });
    await expect(bind(browserClose, ports).call({ projectPath: project, tab: 1 })).resolves.toEqual({ output: 'closed tab 1' });
    expect(ports.done).toEqual(['drop 1']);
    expect(ports.browsers.get(project)).toEqual({ tabs: [tab(2)], active: 2 });
  });

  it('hands the screen back to the opener of a popup that closed itself', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1), tab(2), tab(3)], active: 3 } });
    await bind(browserClose, ports).call({ projectPath: project, tab: 3, opener: 1 });
    expect(ports.browsers.get(project)).toEqual({ tabs: [tab(1), tab(2)], active: 1 });
  });

  it('reads the tab id the command sends as a word', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1), tab(3)], active: 1 } });
    await expect(bind(browserClose, ports).call({ projectPath: project, tab: '3' })).resolves.toEqual({ output: 'closed tab 3' });
    await expect(bind(browserClose, ports).call({ projectPath: project, tab: 'three' })).resolves.toEqual({ refused: 'no tab was named' });
  });

  it("refuses another project's tab", async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1)], active: 1 }, '/work/web': { tabs: [tab(2)], active: 2 } });
    await expect(bind(browserClose, ports).call({ projectPath: project, tab: 2 }))
      .resolves.toEqual({ refused: 'there is no tab 2 in this project' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.switch', () => {
  const ports = () => fakePorts({ [project]: { tabs: [tab(1), tab(2), tab(3)], active: 1 } });

  it('puts the named tab on screen', async () => {
    const fake = ports();
    await expect(bind(browserSwitch, fake).call({ projectPath: project, tab: 3 })).resolves.toEqual({ output: 'on tab 3' });
    expect(fake.browsers.get(project)?.active).toBe(3);
  });

  it('reads the tab id the command sends as a word, and refuses naming nothing', async () => {
    await expect(bind(browserSwitch, ports()).call({ projectPath: project, tab: '3' })).resolves.toEqual({ output: 'on tab 3' });
    await expect(bind(browserSwitch, ports()).call({ projectPath: project })).resolves.toEqual({ refused: 'no tab was named' });
  });

  it('steps from the tab on screen, round the ends', async () => {
    const fake = ports();
    await bind(browserSwitch, fake).call({ projectPath: project, step: -1 });
    expect(fake.browsers.get(project)?.active).toBe(3);
  });

  it('refuses a tab that is not there, and a step with no tabs', async () => {
    await expect(bind(browserSwitch, ports()).call({ projectPath: project, tab: 7 }))
      .resolves.toEqual({ refused: 'there is no tab 7 in this project' });
    await expect(bind(browserSwitch, fakePorts()).call({ projectPath: project, step: 1 }))
      .resolves.toEqual({ refused: 'this project has no tab open' });
  });
});
