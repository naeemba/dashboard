import { describe, expect, it } from 'vitest';
import { hostPattern, pacScript, pacServer, parseProxy, proxyConfig, proxyFailureTitle } from './proxy';

const matches = (pattern: string, host: string): boolean => hostPattern(pattern).test(host);

describe('hostPattern', () => {
  it('takes *.x as x itself and every host under it, as ZeroOmega does', () => {
    expect(matches('*.instacoins.travel', 'instacoins.travel')).toBe(true);
    expect(matches('*.instacoins.travel', 'api.instacoins.travel')).toBe(true);
    expect(matches('*.instacoins.travel', 'a.b.instacoins.travel')).toBe(true);
    expect(matches('.instacoins.travel', 'instacoins.travel')).toBe(true);
    expect(matches('*.instacoins.travel', 'notinstacoins.travel')).toBe(false);
    expect(matches('*.instacoins.travel', 'instacoins.travel.evil.com')).toBe(false);
  });

  it('takes **.x as the hosts under x only', () => {
    expect(matches('**.instacoins.travel', 'api.instacoins.travel')).toBe(true);
    expect(matches('**.instacoins.travel', 'instacoins.travel')).toBe(false);
  });

  it('reads * elsewhere as any run of characters, dots too, over the whole host', () => {
    expect(matches('test-*.internal', 'test-a.internal')).toBe(true);
    expect(matches('test-*.internal', 'test-a.b.internal')).toBe(true);
    expect(matches('test-*.internal', 'prod.internal')).toBe(false);
    expect(matches('instacoins.travel', 'api.instacoins.travel')).toBe(false);
    expect(matches('instacoins.travel', 'INSTACOINS.travel')).toBe(true);
  });

  it('reads a dot as a dot, not any character', () => {
    expect(matches('a.com', 'abcom')).toBe(false);
  });
});

describe('pacServer', () => {
  it('names each scheme as a PAC answer does', () => {
    expect(pacServer('socks5://127.0.0.1:1080')).toBe('SOCKS5 127.0.0.1:1080');
    expect(pacServer('socks4://proxy:1080')).toBe('SOCKS4 proxy:1080');
    expect(pacServer('http://proxy:3128')).toBe('PROXY proxy:3128');
    expect(pacServer('https://proxy:8443')).toBe('HTTPS proxy:8443');
  });

  it('is no server for another scheme or no URL', () => {
    expect(pacServer('ftp://proxy:21')).toBeNull();
    expect(pacServer('127.0.0.1:1080')).toBeNull();
    expect(pacServer('')).toBeNull();
  });
});

describe('parseProxy', () => {
  it('keeps a server and its hosts, trimmed and in lower case', () => {
    expect(parseProxy({ server: ' socks5://127.0.0.1:1080 ', hosts: [' *.Instacoins.travel', '', 3] }))
      .toEqual({ server: 'socks5://127.0.0.1:1080', hosts: ['*.instacoins.travel'] });
  });

  it('proxies nothing for no hosts, a bad server or no block', () => {
    expect(parseProxy({ server: 'socks5://127.0.0.1:1080', hosts: [] })).toBeNull();
    expect(parseProxy({ server: 'nowhere', hosts: ['x.com'] })).toBeNull();
    expect(parseProxy(undefined)).toBeNull();
    expect(parseProxy({ server: 'socks5://127.0.0.1:1080', hosts: 'x.com' })).toBeNull();
  });
});

describe('pacScript', () => {
  // The script as Chromium runs it: a function of the URL and its host.
  const run = (script: string, host: string): string => new Function(`${script}; return FindProxyForURL('https://' + arguments[0] + '/', arguments[0]);`)(host) as string;
  const script = pacScript({ server: 'socks5://127.0.0.1:1080', hosts: ['*.instacoins.travel', 'test-*.internal'] });

  it('sends a listed host to the server, with no direct fallback', () => {
    expect(run(script, 'instacoins.travel')).toBe('SOCKS5 127.0.0.1:1080');
    expect(run(script, 'test-a.internal')).toBe('SOCKS5 127.0.0.1:1080');
  });

  it('sends every other host direct', () => {
    expect(run(script, 'example.com')).toBe('DIRECT');
  });
});

describe('proxyConfig', () => {
  it('is direct with no proxy', () => {
    expect(proxyConfig(null)).toEqual({ mode: 'direct' });
  });

  it('hands the script over percent-encoded, which Electron reads, never base64', () => {
    const config = proxyConfig({ server: 'http://proxy:3128', hosts: ['x.com'] });
    expect(config.mode).toBe('pac_script');
    if (config.mode !== 'pac_script') return;
    expect(config.pacScript.startsWith('data:application/x-ns-proxy-autoconfig,var%20listed')).toBe(true);
    expect(decodeURIComponent(config.pacScript.split(',').slice(1).join(','))).toContain('PROXY proxy:3128');
  });
});

describe('proxyFailureTitle', () => {
  const proxy = { server: 'socks5://127.0.0.1:1080', hosts: ['x.com'] };

  it('says the proxy did not answer for a proxy error', () => {
    expect(proxyFailureTitle(-130, proxy)).toBe('Proxy socks5://127.0.0.1:1080 did not answer');
    expect(proxyFailureTitle(-120, proxy)).toBe('Proxy socks5://127.0.0.1:1080 did not answer');
  });

  it('leaves the title for any other failure, or with no proxy', () => {
    expect(proxyFailureTitle(-105, proxy)).toBeNull();
    expect(proxyFailureTitle(-130, null)).toBeNull();
  });
});
