import { parseProxy, type BrowserProxy } from '../../../shared/browser/proxy';
import { action } from '../action';
import type { BrowserPorts } from './browser-ports';

// browser.proxy: each change to the settings' `browser.proxy` main keeps, given to every project's
// browser so it needs no restart (browser-decision-11); a session's first tab reads it at launch. Main calls it only for
// a proxy that moved, since applying one fails whatever its tabs are loading.
export const browserProxy = action<BrowserPorts, { proxy: BrowserProxy | null }, { output: string }>('browser.proxy', {
  words: [],
  input: (raw) => ({ proxy: parseProxy(raw.proxy) }),
  async run(ports, { proxy }) {
    await ports.useProxy(proxy);
    return { output: proxy === null ? 'every site goes direct' : `${proxy.hosts.join(', ')} through ${proxy.server}` };
  },
});
