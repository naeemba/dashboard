import { paneLinks } from '../../shared/workers/pane-link';

// Every pane address in an element's text, `pane run`'s output and main's replies alike, made a link
// that names the pane. Only text nodes are read, so an address inside an attribute stays as it is.
// The click is chat-view.ts's: it lands on the pane, or says it is closed.
export const PANE_LINK = 'chat-pane-link';

export function linkPanes(element: HTMLElement): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.includes('dashboard://pane/')) found.push(node as Text);
  }
  for (const node of found) {
    const text = node.textContent ?? '';
    const parts: (string | HTMLElement)[] = [];
    let at = 0;
    for (const { start, end, id } of paneLinks(text)) {
      const link = document.createElement('a');
      link.className = PANE_LINK;
      link.href = '#';
      link.dataset.pane = id;
      link.textContent = `pane ${id}`;
      parts.push(text.slice(at, start), link);
      at = end;
    }
    node.replaceWith(...parts, text.slice(at));
  }
}
