import { clockTime } from './chat-status';
import type { Stamp } from './chat-transcript';

const pad = (value: number): string => String(value).padStart(2, '0');

// The line above a message: its time as the status line gives it, with the date when it was not
// written today (a conversation resumed from days ago), and the model that wrote it. Empty when the
// message says neither.
export function stampText(stamp: Stamp, now: Date): string {
  const parts: string[] = [];
  if (stamp.at !== undefined) {
    const at = new Date(stamp.at);
    const time = clockTime(at.toISOString()) ?? '';
    parts.push(at.toDateString() === now.toDateString() ? time : `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${time}`);
  }
  if (stamp.model) parts.push(stamp.model);
  return parts.join(' · ');
}
