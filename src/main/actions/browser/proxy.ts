import { parseProxy, type BrowserProxy } from '../../../shared/browser/proxy';
import { action } from '../action';
import type { BrowserPorts } from './browser-ports';

// browser.proxy: the settings' `browser.proxy` as every project's browser uses it, at launch and on
// each change main keeps, so a change needs no restart (browser-decision-11). Main calls it only for
// a proxy that moved, since applying one fails whatever its tabs are loading.
export const browserProxy = action<BrowserPorts, { proxy: BrowserProxy | null }, { output: string }>('browser.proxy', {
  words: [],
  input: (raw) => ({ proxy: parseProxy(raw.proxy) }),
  async run(ports, { proxy }) {
    await ports.useProxy(proxy);
    return { output: proxy === null ? 'every site goes direct' : `${proxy.hosts.join(', ')} through ${proxy.server}` };
  },
});
