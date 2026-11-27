import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { fakePorts } from './browser-fixture';
import { browserProxy } from './proxy';

const proxy = { server: 'socks5://127.0.0.1:1080', hosts: ['*.instacoins.travel'] };

describe('browser.proxy', () => {
  it('gives every session the listed hosts\' script, then direct again when the setting goes', async () => {
    const ports = fakePorts();
    const action = bind(browserProxy, ports);
    await expect(action.call({ proxy })).resolves.toEqual({ output: '*.instacoins.travel through socks5://127.0.0.1:1080' });
    await expect(action.call({ proxy: null })).resolves.toEqual({ output: 'every site goes direct' });
    expect(ports.done).toEqual(['proxy socks5://127.0.0.1:1080', 'proxy direct']);
  });
});
