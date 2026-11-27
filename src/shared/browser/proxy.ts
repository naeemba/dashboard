import { isRecord } from '../app/is-record';

// The project browser's proxy (docs/browser, browser-decision-11): every site goes direct unless the
// settings file lists its host, and a listed one goes through `server` and nowhere else. Read from
// `browser.proxy` in the settings file; null, an unreadable server or no hosts is everything direct.
export type BrowserProxy = { server: string; hosts: string[] };

// What a server's scheme is called in a PAC answer. A bare `SOCKS` is SOCKSv4 to Chromium, so v4 is
// spelled out rather than left to that.
const PAC_SCHEMES: Record<string, string> = { 'http:': 'PROXY', 'https:': 'HTTPS', 'socks4:': 'SOCKS4', 'socks5:': 'SOCKS5' };

// The server as a PAC answer names it, `SOCKS5 127.0.0.1:1080`, or null for one that is not a server.
// A port left out is the scheme's own, which Chromium fills in.
export function pacServer(server: string): string | null {
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    return null;
  }
  const scheme = PAC_SCHEMES[url.protocol];
  if (scheme === undefined || url.hostname === '') return null;
  return `${scheme} ${url.host}`;
}

// The file's `browser.proxy`, or null: a server that is not one, or no host listed, proxies nothing.
export function parseProxy(stored: unknown): BrowserProxy | null {
  if (!isRecord(stored) || typeof stored.server !== 'string') return null;
  const server = stored.server.trim();
  if (pacServer(server) === null) return null;
  const hosts = Array.isArray(stored.hosts)
    ? stored.hosts.filter((host): host is string => typeof host === 'string').map((host) => host.trim().toLowerCase()).filter((host) => host !== '')
    : [];
  return hosts.length === 0 ? null : { server, hosts };
}

const escaped = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

// A host pattern as the regex it means, the way ZeroOmega's host wildcards read, so a rule copied
// from it means the same here: `*` is any run of characters, dots too; `*.x` and `.x` are x itself
// and every host under it; `**.x` only the hosts under it. The whole host, never a part of one.
export function hostPattern(pattern: string): RegExp {
  if (pattern.startsWith('**.')) return new RegExp(`^.*\\.${escaped(pattern.slice(3))}$`, 'i');
  const domain = pattern.replace(/^\*?\./, '');
  return new RegExp(domain === pattern ? `^${escaped(pattern)}$` : `^(?:.*\\.)?${escaped(domain)}$`, 'i');
}

// The PAC script for the proxy: the listed hosts to the server, with no fallback, so a work site is
// never sent direct when the proxy is down; every other host direct.
export function pacScript(proxy: BrowserProxy): string {
  const listed = proxy.hosts.map((host) => `(?:${hostPattern(host).source})`).join('|');
  return `var listed = new RegExp(${JSON.stringify(listed)}, 'i');
function FindProxyForURL(url, host) {
  return listed.test(host) ? ${JSON.stringify(pacServer(proxy.server))} : 'DIRECT';
}`;
}

// What session.setProxy is given. Percent-encoded: Electron 45 ignores a base64 data: PAC and sends
// everything direct, without a word.
export type ProxyConfig = { mode: 'direct' } | { mode: 'pac_script'; pacScript: string };

export function proxyConfig(proxy: BrowserProxy | null): ProxyConfig {
  if (proxy === null) return { mode: 'direct' };
  return { mode: 'pac_script', pacScript: `data:application/x-ns-proxy-autoconfig,${encodeURIComponent(pacScript(proxy))}` };
}

// Chromium's errors for a proxy that did not answer: ERR_TUNNEL_CONNECTION_FAILED,
// ERR_SOCKS_CONNECTION_FAILED, ERR_SOCKS_CONNECTION_HOST_UNREACHABLE, ERR_PROXY_CONNECTION_FAILED.
const PROXY_FAILURES = new Set([-111, -120, -121, -130]);

// The title a tab whose page failed to load shows, or null to leave it: a page the proxy did not
// carry says so, since it is otherwise titled with its host.
export function proxyFailureTitle(code: number, proxy: BrowserProxy | null): string | null {
  return proxy !== null && PROXY_FAILURES.has(code) ? `Proxy ${proxy.server} did not answer` : null;
}
