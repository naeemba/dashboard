import { liveCut } from './chat-live-cut';
import { renderMarkdown } from './chat-markdown';

// The streaming block's drawing. The part before the last cut (chat-live-cut.ts) is turned into HTML
// once, as it settles; each frame draws only the text after it. Drawn whole every frame, a 16k-character
// answer kept a core busy (docs/performance/history.md). The finished reply is an entry, drawn whole.
export function createLiveBlock(element: HTMLElement): (text: string) => void {
  let shown = '';
  let settled = '';
  let settledNodes = 0;
  // Set for a reply that cannot be cut: it is drawn whole until a new block starts.
  let whole = false;
  return (text) => {
    if (!text.startsWith(shown)) {
      settled = '';
      settledNodes = 0;
      whole = false;
      element.replaceChildren();
    }
    shown = text;
    const cut = whole ? null : liveCut(text, settled.length);
    if (cut === null) {
      whole = true;
      element.innerHTML = renderMarkdown(text);
      return;
    }
    while (element.childNodes.length > settledNodes) element.lastChild?.remove();
    if (cut > settled.length) {
      element.insertAdjacentHTML('beforeend', renderMarkdown(text.slice(settled.length, cut)));
      settled = text.slice(0, cut);
      settledNodes = element.childNodes.length;
    }
    element.insertAdjacentHTML('beforeend', renderMarkdown(text.slice(cut)));
  };
}
