import { liveStep } from './chat-live-cut';
import { renderMarkdown } from './chat-markdown';

// The streaming block's drawing. The part before the last cut (chat-live-cut.ts) is turned into HTML
// once, as it settles; each frame redraws only the text after it. Drawn whole every frame, a
// 16k-character answer kept a core busy (docs/performance/history.md). The finished reply is an entry,
// drawn whole. The block is hidden while it holds nothing.
export function createLiveBlock(element: HTMLElement): (text: string) => void {
  const settledBox = document.createElement('div');
  const tailBox = document.createElement('div');
  element.append(settledBox, tailBox);
  element.hidden = true;
  let shown = '';
  let settled = 0;
  return (text) => {
    const step = liveStep(shown, settled, text);
    shown = text;
    settled = step.settled;
    if (step.clear) settledBox.replaceChildren();
    if (step.settle) settledBox.insertAdjacentHTML('beforeend', renderMarkdown(step.settle));
    tailBox.innerHTML = renderMarkdown(step.tail);
    element.hidden = text === '';
  };
}
