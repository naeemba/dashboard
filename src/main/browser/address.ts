import type { Refused } from '../../shared/app/bridge';
import { isOpenableLink } from '../../shared/panes/links';

// What the browser view may show, and what typing in its address bar means. The view's frames are
// held to the first (frameNavigation, window-navigation.ts), and the address bar and every action that
// loads a page to both, so a tab can never be pointed at a file on this disk or an internal page.

// A web page, or the empty page a new tab and a frame start on.
export function isBrowsable(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc' || isOpenableLink(url);
}

// This machine and the network it is on, where a dev server listens: localhost and its subdomains, the
// loopback and any-address, and the private IPv4 ranges (10/8, 172.16/12, 192.168/16).
const LOCAL_HOST = /^(localhost|[^/:]+\.localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2})(:\d+)?(\/|$)/i;

// What was typed, as the address to load: as typed when it names its scheme, else https, except for
// a server on this machine or its network, which a dev server answers without TLS. Anything that is
// still not a web page is refused, and so is a search: there is no search engine here to send it to.
export function addressUrl(typed: string): string | Refused {
  const text = typed.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('about:')) {
    return isBrowsable(text) ? text : { refused: `${text} is not a web page` };
  }
  const local = LOCAL_HOST.test(text);
  const url = `${local ? 'http' : 'https'}://${text}`;
  const host = URL.parse(url)?.hostname ?? '';
  return !/\s/.test(text) && (local || host.includes('.')) ? url : { refused: `${text || 'Nothing'} is not a web address` };
}
