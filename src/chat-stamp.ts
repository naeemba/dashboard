import { clockTime } from './chat-status';
import type { Stamp } from './chat-transcript';

const pad = (value: number): string => String(value).padStart(2, '0');

// The line above a message: its time as the status line gives it, and the model that wrote it. The
// date is added on the first message of each day, judged against the stamped message before it
// (`previousAt`), never against the clock: a line drawn once stays right however long the pane stays
// open. Empty when the message says neither.
export function stampText(stamp: Stamp, previousAt: number | undefined): string {
  const parts: string[] = [];
  if (stamp.at !== undefined) {
    const at = new Date(stamp.at);
    const time = clockTime(stamp.at) ?? '';
    const sameDay = previousAt !== undefined && new Date(previousAt).toDateString() === at.toDateString();
    parts.push(sameDay ? time : `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${time}`);
  }
  if (stamp.model) parts.push(stamp.model);
  return parts.join(' · ');
}
