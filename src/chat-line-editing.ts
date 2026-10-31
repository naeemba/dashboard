// The readline keys of the Claude screen's boxes, as the Claude Code terminal has them: Ctrl+W kills
// the word before the caret, Ctrl+U back to the start of the line, Ctrl+K on to its end, Ctrl+Y puts
// the last kill back and Alt+Y, straight after, swaps it for the kill before. Kills made one after
// another with nothing between them join into one, so Ctrl+W three times and one Ctrl+Y brings back
// all three words.

import type { CarriedEdit } from './carried-edit';

export type LineEdit = 'kill-word' | 'kill-line-start' | 'kill-line-end' | 'yank' | 'yank-pop';

// The box as the planner sees it: its text and its selection, the caret when the two ends meet.
export type Box = CarriedEdit;

// Replace `from` to `to` with `insert`.
export type Change = { from: number; to: number; insert: string };

// `last` is how the box looked just after this ring's latest edit. A kill or Alt+Y counts as straight
// after only while the box still looks like that; typing or moving the caret breaks the run. `index`
// is the entry a yank put back, which Alt+Y moves on from.
export type KillRing = {
  entries: string[];
  last: { kind: 'kill' | 'yank'; value: string; caret: number; index: number } | null;
};

// As readline's kill-ring-max, so a long session does not keep every word it ever deleted.
const RING_SIZE = 60;

export const EMPTY_RING: KillRing = { entries: [], last: null };

function straightAfter(ring: KillRing, box: Box, kind: 'kill' | 'yank'): KillRing['last'] {
  const last = ring.last;
  return last?.kind === kind && last.value === box.value && box.start === last.caret && box.end === last.caret ? last : null;
}

export function applyChange(value: string, { from, to, insert }: Change): string {
  return value.slice(0, from) + insert + value.slice(to);
}

// What one key does to the box, and the ring it leaves. No change when there is nothing to kill or
// nothing to put back; the ring stays as it was then, so a run of kills survives a key that did nothing.
export function planLineEdit(ring: KillRing, box: Box, edit: LineEdit): { ring: KillRing; change: Change | null } {
  const { value, start, end } = box;
  let change: Change;
  let entries = ring.entries;
  let index = 0;
  if (edit === 'yank' || edit === 'yank-pop') {
    const yanked = straightAfter(ring, box, 'yank');
    if (entries.length === 0 || (edit === 'yank-pop' && !yanked)) return { ring, change: null };
    if (edit === 'yank-pop' && yanked) index = (yanked.index + 1) % entries.length;
    // Alt+Y replaces what the yank before it put back, which ends at the caret.
    const from = edit === 'yank-pop' && yanked ? end - entries[yanked.index].length : start;
    change = { from, to: end, insert: entries[index] };
  } else {
    const [from, to] = start !== end ? [start, end] : killRange(value, start, edit);
    if (from === to) return { ring, change: null };
    const killed = value.slice(from, to);
    const head = entries[0];
    entries = straightAfter(ring, box, 'kill')
      ? [edit === 'kill-line-end' ? head + killed : killed + head, ...entries.slice(1)]
      : [killed, ...entries].slice(0, RING_SIZE);
    change = { from, to, insert: '' };
  }
  const kind = change.insert ? 'yank' : 'kill';
  const last = { kind, value: applyChange(value, change), caret: change.from + change.insert.length, index } as const;
  return { ring: { entries, last }, change };
}

// At a line's start Ctrl+U takes the line break before it, and at its end Ctrl+K the one after, so
// pressing on keeps joining lines as readline does across a multi-line buffer.
function killRange(text: string, caret: number, edit: LineEdit): [number, number] {
  if (edit === 'kill-line-end') {
    const lineEnd = text.indexOf('\n', caret);
    const to = lineEnd === -1 ? text.length : lineEnd;
    return [caret, to === caret ? Math.min(caret + 1, text.length) : to];
  }
  if (edit === 'kill-line-start') {
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    return [lineStart === caret ? Math.max(caret - 1, 0) : lineStart, caret];
  }
  // Whitespace before the caret first, then the word, as readline's unix-word-rubout.
  return [text.slice(0, caret).search(/\S*\s*$/), caret];
}

// One ring for the whole window, as the terminal keeps one per process.
let ring = EMPTY_RING;

// The key acts on whichever box of the screen has the keyboard: the prompt, or a question's answer box.
export function editFocusedBox(screen: HTMLElement | undefined, edit: LineEdit): void {
  const box = document.activeElement;
  if (!(box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) || !screen?.contains(box)) return;
  const planned = planLineEdit(ring, { value: box.value, start: box.selectionStart ?? 0, end: box.selectionEnd ?? 0 }, edit);
  if (!planned.change) return;
  box.setSelectionRange(planned.change.from, planned.change.to);
  // execCommand rather than setting the value: the edit goes on the box's undo stack, so the undo key
  // takes it back, and the box hears the input event its own listeners redraw on. A box that refused
  // the edit leaves the ring as it was, or Ctrl+Y would put back text that never left.
  if (document.execCommand(planned.change.insert ? 'insertText' : 'delete', false, planned.change.insert)) ring = planned.ring;
}
