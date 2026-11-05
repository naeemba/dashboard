import type { ChatContent } from '../../shared/app/bridge';
import type { ChatImage, QueuedPrompt } from '../../shared/chat/chat-transcript';
import { isDoneReport } from '../../shared/workers/done-report';

// What a queued prompt is drawn as and what withdrawing it puts back: its text, and its images for
// the row of thumbnails over the box.
export function promptParts(content: ChatContent): { text: string; images: ChatImage[] } {
  return {
    text: content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n'),
    images: content.flatMap((block) => (block.type === 'image' ? [{ mediaType: block.source.media_type, data: block.source.data }] : [])),
  };
}

// Up in an empty box takes the last queued prompt back, as Claude Code's does; the box must be empty
// so a draft is never overwritten, and with nothing queued Up walks the history as before. The app's
// notice that a worker stopped is skipped: nobody typed it, and taking it back means main never hears.
export function withdrawable(queued: QueuedPrompt[], box: string, attached: number): QueuedPrompt | null {
  if (box !== '' || attached !== 0) return null;
  return queued.findLast((each) => !isDoneReport(promptParts(each.content).text)) ?? null;
}
