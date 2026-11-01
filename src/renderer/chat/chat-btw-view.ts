import type { DashboardBridge } from './bridge';
import type { ChatViewOptions } from './chat-view';
import { renderMarkdown } from './chat-markdown';
import { failureText } from './failure';
import { answerKeys, openOverlay } from './overlay';

// /btw's sheet: the question at once, then the answer under it when it comes, drawn as markdown. It
// never enters the conversation, so it is gone once the sheet is: Escape or Enter puts it away and
// resolves for the screen to take the keyboard back. A sheet put away before the answer drops it.
// ponytail: the answer is still asked for to the end; pass an abort through if dismissed ones cost.
export function askAside(
  bridge: DashboardBridge, slot: number, question: string, say: Pick<ChatViewOptions, 'onError'>,
): Promise<void> {
  return new Promise((resolve) => {
    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('chat-btw', close);
    const asked = document.createElement('p');
    asked.className = 'confirm-question';
    asked.textContent = question;
    const answer = document.createElement('div');
    answer.className = 'chat-btw-answer';
    answer.textContent = 'Answering…';
    const keys = document.createElement('p');
    keys.className = 'confirm-keys';
    keys.textContent = 'Escape or Enter puts it away · not added to the conversation';
    // The sheet hangs off document.body, outside the screen's own link handler, so it opens its own.
    answer.addEventListener('click', (event) => {
      const link = (event.target as Element | null)?.closest('a');
      if (!link) return;
      event.preventDefault();
      bridge.openExternal(link.href);
    });
    dialog.append(asked, answer, keys);
    dialog.focus();
    answerKeys(dialog, close);

    bridge.chatSideQuestion(slot, question).then((text) => {
      if (!dialog.isConnected) return;
      if (text === null) answer.textContent = 'Claude had no answer.';
      else answer.innerHTML = renderMarkdown(text);
    }, (error: unknown) => {
      if (!dialog.isConnected) return;
      close();
      say.onError(`No answer: ${failureText(error)}`);
    });
  });
}
