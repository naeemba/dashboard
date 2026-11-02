import type { Stroke } from './ink-geometry';

// The page's strokes and the pages before the last few changes, as plain values so the rules for which
// change is one undo step can be tested without a canvas. Immutable: every change answers a new
// history, and a change that would do nothing answers the same one, so a caller can tell by identity
// whether anything happened (and whether there is anything to save).
//
// The past holds whole lists of strokes rather than the change that made each, because the strokes
// themselves are never edited — only added or dropped — so the lists share every stroke and a snapshot
// costs an array, not a copy of the ink.
export type InkHistory = { strokes: Stroke[]; past: Stroke[][] };

// A page as it was read: whatever it holds, and nothing to undo. Undo is for this session's own
// changes; going back past the page you were shown would be undoing someone else's writing.
export function startHistory(strokes: Stroke[] = []): InkHistory {
  return { strokes, past: [] };
}

export function addStroke(history: InkHistory, stroke: Stroke): InkHistory {
  return { strokes: [...history.strokes, stroke], past: [...history.past, history.strokes] };
}

// Several strokes at once, because one drag of the eraser is one step however many strokes it crossed.
// An index that is not a stroke is ignored, and a drag that crossed nothing changes nothing.
export function eraseStrokes(history: InkHistory, indices: readonly number[]): InkHistory {
  const doomed = new Set(indices.filter((index) => index >= 0 && index < history.strokes.length));
  if (doomed.size === 0) return history;
  return {
    strokes: history.strokes.filter((_stroke, index) => !doomed.has(index)),
    past: [...history.past, history.strokes],
  };
}

// A step like any other, which is why it can sit on a plain key: undo brings the page back.
export function clearAll(history: InkHistory): InkHistory {
  if (history.strokes.length === 0) return history;
  return { strokes: [], past: [...history.past, history.strokes] };
}

export function undo(history: InkHistory): InkHistory {
  if (history.past.length === 0) return history;
  return { strokes: history.past[history.past.length - 1], past: history.past.slice(0, -1) };
}
