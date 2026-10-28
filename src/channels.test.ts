import { describe, expect, it } from 'vitest';
import { channels } from './channels';

describe('channels', () => {
  it('invokes a handler with the screen first and answers its result', async () => {
    const table = channels();
    table.handle('board:read', (screen, projectPath) => `${screen}:${projectPath}`);
    await expect(table.invoke('mac', 'board:read', ['/code/api'])).resolves.toBe('mac:/code/api');
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

  it('lists the registered names and tells which kind each is', () => {
    const table = channels();
    table.handle('board:read', () => 1);
    table.on('pty:input', () => {});
    expect(table.handled()).toEqual(['board:read']);
    expect(table.listened()).toEqual(['pty:input']);
    expect(table.kind('board:read')).toBe('handle');
    expect(table.kind('pty:input')).toBe('on');
    expect(table.kind('nope:nothing')).toBeUndefined();
  });
});
