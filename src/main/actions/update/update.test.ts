import { describe, expect, it, vi } from 'vitest';
import type { Release, UpdateState } from '../../../shared/app/update';
import { bind } from '../action';
import { scheduledCheck, updateCheck } from './check';
import { updateDownload } from './download';
import { updateInstall } from './install';
import { updateRestart } from './restart';

const RELEASE: Release = { version: '2.45.0', notes: [], url: 'https://example.com', assets: [] };
const ANSWER = { tag_name: 'v2.45.0', html_url: 'https://example.com', body: '', assets: [] };

function held(initial: UpdateState) {
  let state = initial;
  const set = vi.fn((next: UpdateState) => { state = next; });
  return { state: () => state, set };
}

describe('update.check', () => {
  it('says a newer release is out, and nothing for this build\'s own', async () => {
    const ports = held({ kind: 'none' });
    const newer = bind(updateCheck, { ...ports, latest: async () => ANSWER, running: '2.44.0+acf504ceef1b', refusal: () => null });
    await expect(newer.call({})).resolves.toEqual({ output: 'v2.45.0 is out' });
    expect(ports.state()).toEqual({ kind: 'available', release: { ...RELEASE, notes: [] } });
    const same = bind(updateCheck, { ...ports, latest: async () => ANSWER, running: '2.45.0+0123456789ab', refusal: () => null });
    await same.call({});
    expect(ports.state()).toEqual({ kind: 'none' });
  });

  it('tells a machine that cannot install the release why, rather than offering it', async () => {
    const ports = held({ kind: 'none' });
    const refusal = () => ({ refused: 'this is a development run' });
    const check = bind(updateCheck, { ...ports, latest: async () => ANSWER, running: '2.44.0+x', refusal });
    await expect(check.call({})).resolves.toEqual({ refused: 'this is a development run' });
    expect(ports.state()).toEqual({ kind: 'none' });
  });

  it('leaves a downloaded release alone', async () => {
    const ports = held({ kind: 'staged', release: RELEASE });
    const latest = vi.fn(async () => ANSWER);
    await bind(updateCheck, { ...ports, latest, running: '2.44.0+x', refusal: () => null }).call({});
    expect(latest).not.toHaveBeenCalled();
    expect(ports.set).not.toHaveBeenCalled();
  });

  it('leaves a download that started while GitHub was answering alone', async () => {
    const ports = held({ kind: 'available', release: RELEASE });
    const latest = async () => {
      ports.set({ kind: 'downloading', release: RELEASE });
      ports.set.mockClear();
      return ANSWER;
    };
    await expect(bind(updateCheck, { ...ports, latest, running: '2.44.0+x', refusal: () => null }).call({}))
      .resolves.toEqual({ output: 'v2.45.0 is already on its way' });
    expect(ports.set).not.toHaveBeenCalled();
    expect(ports.state().kind).toBe('downloading');
  });
});

describe('the scheduled check', () => {
  it('asks nothing while the settings row is off, and logs a failure', async () => {
    const check = vi.fn(async () => { throw new Error('GitHub answered 503'); });
    const warn = vi.fn();
    scheduledCheck(() => false, check, warn)();
    expect(check).not.toHaveBeenCalled();
    scheduledCheck(() => true, check, warn)();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('update check failed: GitHub answered 503'));
  });
});

describe('update.download', () => {
  it('stages an available release and says so', async () => {
    const ports = held({ kind: 'available', release: RELEASE });
    const stage = vi.fn(async () => undefined);
    await expect(bind(updateDownload, { ...ports, stage }).call({})).resolves.toEqual({ output: 'v2.45.0 is ready: restart to update' });
    expect(ports.set.mock.calls.map(([next]) => next.kind)).toEqual(['downloading', 'staged']);
  });

  it('puts a failed download back as available, with the failure', async () => {
    const ports = held({ kind: 'available', release: RELEASE });
    const stage = vi.fn(async () => { throw new Error('came down short'); });
    await expect(bind(updateDownload, { ...ports, stage }).call({})).rejects.toThrow('came down short');
    expect(ports.state()).toEqual({ kind: 'available', release: RELEASE, failure: 'Not downloaded: came down short' });
  });

  it('refuses with nothing to download', async () => {
    const stage = vi.fn();
    await expect(bind(updateDownload, { ...held({ kind: 'none' }), stage }).call({})).resolves.toEqual({ refused: 'there is no newer release to download' });
    await expect(bind(updateDownload, { ...held({ kind: 'downloading', release: RELEASE }), stage }).call({}))
      .resolves.toEqual({ refused: 'v2.45.0 is already downloading' });
    expect(stage).not.toHaveBeenCalled();
  });
});

describe('update.restart', () => {
  it('checks the staged app, then asks to quit with it armed', async () => {
    const order: string[] = [];
    const restart = bind(updateRestart, {
      ...held({ kind: 'staged', release: RELEASE }),
      verify: async () => { order.push('verify'); },
      quit: (release) => { order.push(`quit ${release.version}`); },
    });
    await expect(restart.call({})).resolves.toEqual({ output: 'restarting into v2.45.0' });
    expect(order).toEqual(['verify', 'quit 2.45.0']);
  });

  it('does not ask to quit when the staged app is not the release, and says why', async () => {
    const ports = held({ kind: 'staged', release: RELEASE });
    const quit = vi.fn();
    const restart = bind(updateRestart, { ...ports, verify: async () => { throw new Error('the staged app does not carry v2.45.0'); }, quit });
    await expect(restart.call({})).rejects.toThrow();
    expect(quit).not.toHaveBeenCalled();
    expect(ports.state()).toMatchObject({ kind: 'staged', failure: 'Not installed: the staged app does not carry v2.45.0' });
  });

  it('refuses with nothing downloaded', async () => {
    const restart = bind(updateRestart, { ...held({ kind: 'available', release: RELEASE }), verify: vi.fn(), quit: vi.fn() });
    await expect(restart.call({})).resolves.toEqual({ refused: 'no update is downloaded to restart into' });
  });
});

describe('update.install', () => {
  function installing(armed: Release | null, swap: () => Promise<void> = async () => undefined) {
    let held = armed;
    const order: string[] = [];
    const ports = {
      armed: () => held,
      disarm: () => { held = null; },
      swap: vi.fn(async () => { order.push('swap'); await swap(); }),
      relaunch: vi.fn(() => { order.push('relaunch'); }),
      log: vi.fn(),
    };
    return { install: bind(updateInstall, ports), ports, order, armed: () => held };
  }

  it('runs nothing with no update armed', async () => {
    const { install, order } = installing(null);
    await expect(install.call({ quit: true })).resolves.toEqual({ refused: 'no update is waiting for this quit' });
    expect(order).toEqual([]);
  });

  it('forgets an armed update when the quit is cancelled, so the next quit is only a quit', async () => {
    const { install, order } = installing(RELEASE);
    await install.call({ quit: false });
    await expect(install.call({ quit: true })).resolves.toHaveProperty('refused');
    expect(order).toEqual([]);
  });

  it('swaps the armed update in, then relaunches', async () => {
    const { install, order, armed } = installing(RELEASE);
    await expect(install.call({ quit: true })).resolves.toEqual({ output: 'restarting into v2.45.0' });
    expect(order).toEqual(['swap', 'relaunch']);
    expect(armed()).toBeNull();
  });

  it('does not relaunch when the swap fails, and logs why', async () => {
    const { install, ports, order } = installing(RELEASE, async () => { throw new Error('EXDEV'); });
    await install.call({ quit: true });
    expect(order).toEqual(['swap']);
    expect(ports.log).toHaveBeenCalledWith({ level: 'warn', kind: 'app', message: 'update not installed: EXDEV' });
  });
});
