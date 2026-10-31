import { piece } from './chat-foot-view';
import { promptParts, type QueuedPrompt } from './chat-queue';

// The prompts sent while Claude was busy, under the conversation and grey until the session takes
// them, as Claude Code draws its queue. Hidden with nothing waiting.
export function createQueueStrip(): { element: HTMLElement; render(queued: QueuedPrompt[]): void } {
  const element = document.createElement('div');
  element.className = 'chat-queued';
  element.hidden = true;
  let drawn: QueuedPrompt[] = [];
  return {
    element,
    render(queued) {
      if (queued === drawn) return;
      drawn = queued;
      element.hidden = queued.length === 0;
      element.replaceChildren(...queued.map(({ content }) => {
        const { text, images } = promptParts(content);
        const row = piece('chat-queued-prompt', text);
        if (images.length > 0) row.append(` + ${images.length} image${images.length === 1 ? '' : 's'}`);
        return row;
      }));
    },
  };
}
