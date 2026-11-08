import { describe, expect, it, vi } from 'vitest';
import { channels, registerWithIpc } from './channels';

const callbacks = vi.hoisted(() => new Map<string, (...channelArguments: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, callback: (...channelArguments: unknown[]) => unknown) => callbacks.set(channel, callback),
    on: (channel: string, callback: (...channelArguments: unknown[]) => unknown) => callbacks.set(channel, callback),
  },
}));

describe('channels', () => {
  it('invokes a handler with the screen first and answers its result', async () => {
    const table = channels();
    table.handle('board:read', (screen, projectPath) => `${screen}:${projectPath}`);
    await expect(table.invoke('mac', 'board:read', ['/code/api'])).resolves.toBe('mac:/code/api');
  });

  it('tells whenThrown of a handler that throws or rejects, with its channel and action, and still fails the call', async () => {
    const table = channels();
    const seen: unknown[] = [];
    table.whenThrown((channel, error, action) => seen.push([channel, (error as Error).message, action]));
    table.handle('project:close', () => { throw new Error('An object could not be cloned'); }, 'project.close');
    table.handle('board:read', () => Promise.reject(new Error('EACCES')));
    table.on('pty:input', () => { throw new Error('gone'); });
    await expect(table.invoke('local', 'project:close', [])).rejects.toThrow('An object could not be cloned');
    await expect(table.invoke('local', 'board:read', [])).rejects.toThrow('EACCES');
    expect(() => table.dispatch('local', 'pty:input', [])).toThrow('gone');
    expect(seen).toEqual([
      ['project:close', 'An object could not be cloned', 'project.close'], ['board:read', 'EACCES', undefined], ['pty:input', 'gone', undefined],
    ]);
  });

  it('rejects an unknown channel by name', async () => {
    const table = channels();
    await expect(table.invoke('mac', 'nope:nothing', [])).rejects.toThrow('No such channel: nope:nothing');
  });

  it('dispatches a send and ignores one nobody registered', () => {
    const table = channels();
    const seen: unknown[] = [];
    table.on('pty:input', (screen, id, data) => seen.push([screen, id, data]));
    table.dispatch('mac', 'pty:input', ['0-1', 'ls']);
    table.dispatch('mac', 'nope:nothing', []);
    expect(seen).toEqual([['mac', '0-1', 'ls']]);
  });

  it('turns a throwing handler into a rejection, not a crash', async () => {
    const table = channels();
    table.handle('board:write', () => { throw new Error('disk full'); });
    await expect(table.invoke('mac', 'board:write', [])).rejects.toThrow('disk full');
  });

  it('lists the registered names', () => {
    const table = channels();
    table.handle('board:read', () => 1);
    table.on('pty:input', () => {});
    expect(table.handled()).toEqual(['board:read']);
    expect(table.listened()).toEqual(['pty:input']);
  });

  it('dispatches a send that arrives as a request and answers null', async () => {
    const table = channels();
    const typed: unknown[] = [];
    table.on('pty:input', (screen, id, data) => { typed.push(screen, id, data); return 'ignored'; });
    await expect(table.invoke('mac', 'pty:input', ['0:1', 'ls'])).resolves.toBeNull();
    expect(typed).toEqual(['mac', '0:1', 'ls']);
    await expect(table.invoke('mac', 'nope:nothing', [])).rejects.toThrow('No such channel: nope:nothing');
  });

  it('keeps the client-local channels on the table while a remote host is set', async () => {
    const table = channels();
    const seen: string[] = [];
    table.handle('settings:read', () => { seen.push('table:settings:read'); });
    table.handle('board:read', () => { seen.push('table:board:read'); });
    const remote = {
      invoke: async (channel: string) => { seen.push(`remote:${channel}`); },
      send: () => {},
    };
    callbacks.clear();
    registerWithIpc(table, () => remote);
    await callbacks.get('settings:read')!({}, 1);
    await callbacks.get('board:read')!({}, '/code/api');
    expect(seen).toEqual(['table:settings:read', 'remote:board:read']);

    seen.length = 0;
    callbacks.clear();
    registerWithIpc(table, () => null);
    await callbacks.get('settings:read')!({});
    await callbacks.get('board:read')!({});
    expect(seen).toEqual(['table:settings:read', 'table:board:read']);
  });
});
