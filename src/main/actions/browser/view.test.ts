import { describe, expect, it } from 'vitest';
import { NO_TABS } from '../../../shared/browser/browser';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { boundsOf, browserFocus, browserHide, browserReset, browserShow } from './view';

const project = '/work/api';
const tab = (id: number) => ({ id, url: 'about:blank', title: '', holder: 'user' });

describe('boundsOf', () => {
  it('rounds to whole pixels', () => {
    expect(boundsOf({ x: 0.4, y: 30.6, width: 800, height: 600.5 })).toEqual({ x: 0, y: 31, width: 800, height: 601 });
  });

  it('is no place for a missing, negative or non-number side', () => {
    expect(boundsOf({ x: 0, y: 0, width: 800 })).toBeNull();
    expect(boundsOf({ x: -1, y: 0, width: 800, height: 600 })).toBeNull();
    expect(boundsOf({ x: 0, y: 0, width: Number.NaN, height: 600 })).toBeNull();
    expect(boundsOf('0,0,800,600')).toBeNull();
  });
});

describe('browser.show and browser.hide', () => {
  it('places the project\'s view, then takes it away', async () => {
    const ports = fakePorts();
    await bind(browserShow, ports).call({ projectPath: project, bounds: { x: 0, y: 64, width: 800, height: 500 } });
    await bind(browserHide, ports).call({});
    expect(ports.done).toEqual(['place /work/api {"x":0,"y":64,"width":800,"height":500}', 'place none']);
  });

  it('refuses bounds it cannot read, placing nothing', async () => {
    const ports = fakePorts();
    await expect(bind(browserShow, ports).call({ projectPath: project, bounds: null }))
      .resolves.toEqual({ refused: 'the bounds were not ones the app could read' });
    expect(ports.done).toEqual([]);
  });
});

describe('browser.focus', () => {
  it('gives the tab on screen the keyboard', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(2)], active: 2 } });
    await bind(browserFocus, ports).call({ projectPath: project });
    expect(ports.done).toEqual(['focus 2']);
  });

  it('refuses a project with no tab', async () => {
    await expect(bind(browserFocus, fakePorts()).call({ projectPath: project }))
      .resolves.toEqual({ refused: 'this project has no tab open' });
  });
});

describe('browser.reset', () => {
  it('drops every tab of the project and no other', async () => {
    const ports = fakePorts({ [project]: { tabs: [tab(1), tab(2)], active: 1 }, '/work/web': { tabs: [tab(3)], active: 3 } });
    await expect(bind(browserReset, ports).call({ projectPath: project })).resolves.toEqual({ output: 'closed 2 tabs' });
    expect(ports.done).toEqual(['drop 1', 'drop 2']);
    expect(ports.browsers.get(project)).toEqual(NO_TABS);
    expect(ports.browsers.get('/work/web')?.tabs).toHaveLength(1);
  });
});
