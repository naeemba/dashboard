import type { DashboardBridge } from './bridge';
import { promptAfterRewind, restoredNotice, rewindChoices, rewindRows } from './chat-rewind';
import type { ChatViewOptions } from './chat-view';
import { failureText } from './failure';
import { searchOverlay } from './overlay';

// /rewind's two sheets: the conversation's prompts, newest first, then what goes back to how it was
// before the one picked. Resolves with that prompt when the conversation went back, for the box to
// hold again as Claude Code's does, and undefined otherwise.
export async function rewind(
  bridge: DashboardBridge, slot: number, say: Pick<ChatViewOptions, 'onError' | 'onNotice'>,
): Promise<string | undefined> {
  try {
    const points = await bridge.chatPrompts(slot);
    if (points.length === 0) {
      say.onNotice('This conversation has no prompt to rewind to.');
      return undefined;
    }
    const point = await searchOverlay({
      name: 'chat-rewind', placeholder: 'Search prompts', rows: (query) => rewindRows(points, query),
      empty: 'No prompt matches.', glyph: () => 'claude',
    });
    if (point === undefined) return undefined;
    const choice = await searchOverlay({
      name: 'chat-rewind', placeholder: 'Rewind to just before this prompt', rows: rewindChoices,
      empty: 'Nothing to restore matches.', glyph: () => 'claude',
    });
    if (choice === undefined) return undefined;
    const restored = await bridge.chatRewind(slot, point, choice);
    const notice = restored === null ? null : restoredNotice(restored);
    if (notice) (notice.error ? say.onError : say.onNotice)(notice.text);
    return promptAfterRewind(point, choice, notice);
  } catch (error) {
    say.onError(`Not rewound: ${failureText(error)}`);
    return undefined;
  }
}
