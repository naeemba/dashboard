import { describe, expect, it } from 'vitest';
import type { BrowserTab } from '../../../shared/browser/browser';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { browserClaim, browserRelease, browserRevoke } from './claims';

const tab = (id: number, holder = 'user', takenFrom?: string): BrowserTab => ({
  id, url: 'about:blank', title: '', holder, ...(takenFrom === undefined ? {} : { takenFrom: [takenFrom] }),
});
const project = '/work/api';

describe('browser.claim', () => {
  it('gives the pane the user\'s tab', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1)], active: 1 } });
    await expect(bind(browserClaim, ports).call({ pane: '3:1', tab: '1' })).resolves.toEqual({ output: 'pane 3:1 holds tab 1' });
    expect(ports.browsers.get(project)?.tabs[0].holder).toBe('3:1');
  });

  it('refuses another pane\'s tab and changes nothing', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1, '3:2')], active: 1 } });
    await expect(bind(browserClaim, ports).call({ pane: '3:1', tab: 1 })).resolves.toEqual({ refused: 'tab 1 is held by pane 3:2' });
    expect(ports.browsers.get(project)?.tabs[0].holder).toBe('3:2');
  });

  it('refuses a claim that names no pane or no tab', async () => {
    await expect(bind(browserClaim, fakePorts()).call({ tab: 1 })).resolves.toEqual({ refused: 'no pane was given' });
    await expect(bind(browserClaim, fakePorts()).call({ pane: '3:1', tab: 'one' })).resolves.toEqual({ refused: 'no tab was named' });
  });
});

describe('browser.release', () => {
  it('hands one tab the pane holds back to the user', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1, '3:1')], active: 1 } });
    await expect(bind(browserRelease, ports).call({ pane: '3:1', tab: 1 })).resolves.toEqual({ output: 'tab 1 is the user\'s again' });
    expect(ports.browsers.get(project)?.tabs[0].holder).toBe('user');
    expect(ports.done).toEqual(['unsize 1']);
  });

  it('hands a tab back even when its size will not clear', async () => {
    const ports = { ...fakePorts({ [project]: { tabs: [tab(1, '3:1')], active: 1 } }), emulate: () => Promise.reject(new Error('tab 1 is closed')) };
    await expect(bind(browserRelease, ports).call({ pane: '3:1', tab: 1 })).resolves.toEqual({ output: 'tab 1 is the user\'s again' });
    expect(ports.browsers.get(project)?.tabs[0].holder).toBe('user');
  });

  it('refuses a tab the pane does not hold', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1, '3:2')], active: 1 } });
    await expect(bind(browserRelease, ports).call({ pane: '3:1', tab: 1 })).resolves.toEqual({ refused: 'tab 1 is held by pane 3:2' });
  });

  it('with no tab named, lets go of every tab the pane holds in every project, and no other pane\'s, and tells the main that dispatched it', async () => {
    const ports = fakePorts({
      [project]: { tabs: [tab(1, '3:1'), tab(2, '3:2'), tab(3, 'user', '3:1')], active: 1 },
      '/work/web': { tabs: [tab(4, '3:1')], active: 4 },
    });
    await expect(bind(browserRelease, ports).call({ pane: '3:1' })).resolves.toEqual({ output: 'released 2 tabs of 3:1' });
    expect(ports.browsers.get(project)?.tabs).toEqual([tab(1), tab(2, '3:2'), tab(3)]);
    expect(ports.browsers.get('/work/web')?.tabs).toEqual([tab(4)]);
    expect(ports.done).toEqual(['unsize 1', 'unsize 4', 'tell 5 Pane 3:1 was let go of still holding these browser tabs. They are left open and are the user\'s now:']);
    await expect(bind(browserRelease, ports).call({ pane: '3:1' })).resolves.toEqual({ output: 'released 0 tabs of 3:1' });
    expect(ports.done).toHaveLength(3);
  });
});

describe('browser.revoke', () => {
  it('takes the tab on screen back from its agent, whose next call is refused saying so', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1, '3:1')], active: 1 } });
    await expect(bind(browserRevoke, ports).call({ projectPath: project })).resolves.toEqual({ output: 'took tab 1 back from 3:1' });
    expect(ports.browsers.get(project)?.tabs[0]).toEqual(tab(1, 'user', '3:1'));
    expect(ports.done).toEqual(['unsize 1']);
    await expect(bind(browserRelease, ports).call({ pane: '3:1', tab: 1 }))
      .resolves.toEqual({ refused: 'the user took tab 1 back from this pane; it is theirs now' });
    await expect(bind(browserClaim, ports).call({ pane: '3:1', tab: 1 })).resolves.toHaveProperty('refused');
  });

  it('keeps every pane it was taken from refused, whoever claims it between', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1, '3:1')], active: 1 } });
    await bind(browserRevoke, ports).call({ projectPath: project });
    await bind(browserClaim, ports).call({ pane: '3:2', tab: 1 });
    await expect(bind(browserRelease, ports).call({ pane: '3:1', tab: 1 })).resolves.toEqual({ refused: 'tab 1 is held by pane 3:2' });
    await bind(browserRevoke, ports).call({ projectPath: project });
    expect(ports.browsers.get(project)?.tabs[0].takenFrom).toEqual(['3:1', '3:2']);
    await expect(bind(browserClaim, ports).call({ pane: '3:1', tab: 1 })).resolves.toHaveProperty('refused');
  });

  it('refuses a tab that is already yours, and a project with none', async () => {
    await expect(bind(browserRevoke, fakePorts({ [project]: { tabs: [tab(1)], active: 1 } })).call({ projectPath: project }))
      .resolves.toEqual({ refused: 'tab 1 is already yours' });
    await expect(bind(browserRevoke, fakePorts()).call({ projectPath: project })).resolves.toEqual({ refused: 'this project has no tab open' });
  });
});
