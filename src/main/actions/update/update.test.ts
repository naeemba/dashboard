import { describe, expect, it, vi } from 'vitest';
import type { Release, UpdateState } from '../../../shared/app/update';
import { bind } from '../action';
import { updateCheck } from './check';
import { updateDownload } from './download';
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
  it('swaps, then restarts', async () => {
    const order: string[] = [];
    const restart = bind(updateRestart, {
      ...held({ kind: 'staged', release: RELEASE }),
      swap: async () => { order.push('swap'); },
      relaunch: () => { order.push('relaunch'); },
    });
    await restart.call({});
    expect(order).toEqual(['swap', 'relaunch']);
  });

  it('does not restart when the swap fails, and says why', async () => {
    const ports = held({ kind: 'staged', release: RELEASE });
    const relaunch = vi.fn();
    const restart = bind(updateRestart, { ...ports, swap: async () => { throw new Error('the staged app does not carry v2.45.0'); }, relaunch });
    await expect(restart.call({})).rejects.toThrow();
    expect(relaunch).not.toHaveBeenCalled();
    expect(ports.state()).toMatchObject({ kind: 'staged', failure: 'Not installed: the staged app does not carry v2.45.0' });
  });

  it('refuses with nothing downloaded', async () => {
    const restart = bind(updateRestart, { ...held({ kind: 'available', release: RELEASE }), swap: vi.fn(), relaunch: vi.fn() });
    await expect(restart.call({})).resolves.toEqual({ refused: 'no update is downloaded to restart into' });
  });
});
