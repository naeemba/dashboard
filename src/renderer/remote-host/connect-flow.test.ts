import { describe, expect, it, vi } from 'vitest';
import { showPicker, typedHostFolder, type ConnectFlowPorts } from './connect-flow';
import type { PickerChoice } from '../app/picker';
import { defaultSettings } from '../../shared/settings/settings';

// Everything the flow touches is a fake: the answers are queued up front, the calls are recorded.
function setup(choice: PickerChoice, answers: (string | null)[] = [], saved = { address: '', token: '' }, host = 'local') {
  let settings = { ...defaultSettings(false), remote: saved };
  const queue = [...answers];
  const bridge = {
    getRecentProjects: vi.fn(async () => []),
    connectHost: vi.fn<(address: string, token: string) => Promise<string>>(async () => ''),
    disconnectHost: vi.fn(async () => undefined),
  };
  const ports: ConnectFlowPorts = {
    bridge,
    pick: vi.fn(async () => choice),
    prompt: vi.fn(async () => queue.shift() ?? null),
    projectPages: () => [],
    openProject: vi.fn(async () => undefined),
    settings: () => settings,
    setSettings: (next) => { settings = next; },
    host: () => host,
    restore: vi.fn(),
    showNotice: vi.fn(),
  };
  return { ports, bridge, remote: () => settings.remote };
}

describe('showPicker', () => {
  it('restores when the picker is dismissed', async () => {
    const { ports, bridge } = setup(undefined);
    await showPicker(ports);
    expect(ports.restore).toHaveBeenCalledOnce();
    expect(bridge.connectHost).not.toHaveBeenCalled();
  });

  it('hands an open choice to openProject without restoring', async () => {
    const { ports } = setup({ kind: 'open', path: '/code/api' });
    await showPicker(ports);
    expect(ports.openProject).toHaveBeenCalledWith('/code/api');
    expect(ports.restore).not.toHaveBeenCalled();
  });

  it('restores when the address prompt is cancelled', async () => {
    const { ports, bridge } = setup({ kind: 'connect' }, [null]);
    await showPicker(ports);
    expect(bridge.connectHost).not.toHaveBeenCalled();
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('restores when the typed address is empty', async () => {
    const { ports, bridge } = setup({ kind: 'connect' }, ['   ']);
    await showPicker(ports);
    expect(bridge.connectHost).not.toHaveBeenCalled();
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('restores when the token prompt is cancelled', async () => {
    const { ports, bridge } = setup({ kind: 'connect' }, ['10.0.0.2:7777', null]);
    await showPicker(ports);
    expect(bridge.connectHost).not.toHaveBeenCalled();
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('connects with the trimmed address and remembers it on success', async () => {
    const { ports, bridge, remote } = setup({ kind: 'connect' }, [' 10.0.0.2:7777 ', 'secret']);
    await showPicker(ports);
    expect(bridge.connectHost).toHaveBeenCalledWith('10.0.0.2:7777', 'secret');
    expect(remote()).toEqual({ address: '10.0.0.2:7777', token: 'secret' });
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('reuses the saved token to reconnect', async () => {
    const { ports, bridge } = setup({ kind: 'reconnect', address: '10.0.0.2:7777' }, [], { address: '10.0.0.2:7777', token: 'saved' });
    await showPicker(ports);
    expect(ports.prompt).not.toHaveBeenCalled();
    expect(bridge.connectHost).toHaveBeenCalledWith('10.0.0.2:7777', 'saved');
  });

  it('asks for both when a reconnect has no saved token', async () => {
    const { ports, bridge } = setup({ kind: 'reconnect', address: '10.0.0.2:7777' }, ['10.0.0.2:7777', 'fresh']);
    await showPicker(ports);
    expect(ports.prompt).toHaveBeenCalledTimes(2);
    expect(bridge.connectHost).toHaveBeenCalledWith('10.0.0.2:7777', 'fresh');
  });

  it('shows a refusal, keeps the settings and restores', async () => {
    const { ports, bridge, remote } = setup({ kind: 'connect' }, ['10.0.0.2:7777', 'bad']);
    bridge.connectHost.mockResolvedValue('Wrong token');
    await showPicker(ports);
    expect(ports.showNotice).toHaveBeenLastCalledWith('host', 'Wrong token');
    expect(remote()).toEqual({ address: '', token: '' });
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('clears an old host notice before trying', async () => {
    const { ports } = setup({ kind: 'connect' }, ['10.0.0.2:7777', 'secret']);
    await showPicker(ports);
    expect(ports.showNotice).toHaveBeenCalledWith('host', '');
  });

  it('disconnects, clears the notice and restores', async () => {
    const { ports, bridge } = setup({ kind: 'disconnect', address: '10.0.0.2:7777' }, [], undefined, '10.0.0.2:7777');
    await showPicker(ports);
    expect(bridge.disconnectHost).toHaveBeenCalledOnce();
    expect(ports.showNotice).toHaveBeenCalledWith('host', '');
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('says why a rejected connect failed and restores', async () => {
    const { ports, bridge } = setup({ kind: 'connect' }, ['10.0.0.2:7777', 'secret']);
    bridge.connectHost.mockRejectedValue(new Error('channel closed'));
    await showPicker(ports);
    expect(ports.showNotice).toHaveBeenLastCalledWith('host', 'channel closed');
    expect(ports.restore).toHaveBeenCalledOnce();
  });

  it('says why a rejected disconnect failed and restores', async () => {
    const { ports, bridge } = setup({ kind: 'disconnect', address: 'x' });
    bridge.disconnectHost.mockRejectedValue(new Error('gone'));
    await showPicker(ports);
    expect(ports.showNotice).toHaveBeenLastCalledWith('host', 'gone');
    expect(ports.restore).toHaveBeenCalledOnce();
  });
});

describe('typedHostFolder', () => {
  it('trims what was typed', async () => {
    expect(await typedHostFolder('h:1', async () => ' /code/api ')).toBe('/code/api');
  });

  it('is null when dismissed or empty', async () => {
    expect(await typedHostFolder('h:1', async () => null)).toBeNull();
    expect(await typedHostFolder('h:1', async () => '  ')).toBeNull();
  });
});
