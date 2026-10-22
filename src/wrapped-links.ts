import type { LinkSpan } from './file-links';
import type { WidthAt } from './print-widths';
import { bufferLine, cellColumn, type CellLine, type PaneBuffer } from './pane';

// A link that does not fit on its row carries on onto the next one, two ways. The terminal wraps it,
// and marks the next row `isWrapped`. Or the program printing it wraps it itself: Claude Code breaks
// a long path at the pane's edge and indents the rest under its list item, so to the terminal the
// halves are separate lines. Read one row at a time, either way a click on the first half opens a path
// cut short — `docs/superpowers/` instead of `docs/superpowers/specs/clients-design.md`. So the rows
// are joined back into the line they were printed as, and links are found in that.

type WrapLine = CellLine & { isWrapped: boolean; translateToString(trim: boolean): string };
export type WrapBuffer = Omit<PaneBuffer, 'getLine'> & { getLine(row: number): WrapLine | undefined };

// Rows are the buffer's own, columns are cells counted from 0 and the end column is exclusive.
type PlacedLink<T> = {
  link: T;
  text: string;
  start: { row: number; column: number };
  end: { row: number; column: number };
};

// How wide a row is, in cells.
function rowWidth(buffer: WrapBuffer, row: number): number {
  return cellColumn(buffer.getLine(row), bufferLine(buffer, row).length);
}

// Where the row below picks this one up, with its indent off, or null when it does not.
// ponytail: a row the program wrapped is told apart from one that merely ends there by reaching the
// last column of the width it was printed at, or the one before it, ending in a word with a slash in
// it (a path or an address in progress, never a prose word like `in`), with an indented row under it —
// so a path that happens to end at the edge takes the first word of an indented next row with it, and
// a path the program cut before its first slash stays two halves, the tail read as a path of its own.
// Pass `() => Infinity` as the widths to read only the terminal's own wraps, for a pane such as nvim
// that lays out its rows itself.
function carriedOn(buffer: WrapBuffer, row: number, widthAt: WidthAt): number | null {
  const next = buffer.getLine(row + 1);
  if (!next) return null;
  const nextText = next.translateToString(true);
  const indent = next.isWrapped ? 0 : nextText.length - nextText.trimStart().length;
  if (!/\S/.test(nextText.charAt(indent))) return null;
  if (next.isWrapped) return indent;
  return indent > 0 && /\/\S*$/.test(bufferLine(buffer, row)) && rowWidth(buffer, row) >= widthAt(row) - 1 ? indent : null;
}

// Each row of the line, from where its text begins in the joined string.
type Segment = { row: number; offset: number; indent: number };

// Every link in the line this row is part of, with the rows above and below that carry it on.
function linksOnLine<T extends LinkSpan>(
  buffer: WrapBuffer, row: number, widthAt: WidthAt, find: (text: string) => T[],
): PlacedLink<T>[] {
  let first = row;
  while (first > 0 && carriedOn(buffer, first - 1, widthAt) !== null) first -= 1;
  const segments: Segment[] = [];
  let text = '';
  for (let current = first, indent: number | null = 0; indent !== null; current += 1) {
    segments.push({ row: current, offset: text.length, indent });
    const next = carriedOn(buffer, current, widthAt);
    // A row the terminal wrapped is full, so a space in its last cell is part of the line and stays.
    const full = next !== null && buffer.getLine(current + 1)?.isWrapped;
    text += (full ? buffer.getLine(current)?.translateToString(false) ?? '' : bufferLine(buffer, current)).slice(indent);
    indent = next;
  }
  // A start sits in the row it begins in; an end, being exclusive, in the row of its last character.
  const place = (offset: number, isEnd: boolean) => {
    const segment = segments.findLast((candidate) => (isEnd ? candidate.offset < offset : candidate.offset <= offset))
      ?? segments[0];
    return {
      row: segment.row,
      column: cellColumn(buffer.getLine(segment.row), segment.indent + offset - segment.offset),
    };
  };
  return find(text).map((link) => ({
    link,
    text: text.slice(link.start, link.end),
    start: place(link.start, false),
    end: place(link.end, true),
  }));
}

// Each link once, on the row it starts on, so the hint key labels a wrapped path once and not its tail.
export function linksStartingOn<T extends LinkSpan>(
  buffer: WrapBuffer, row: number, widthAt: WidthAt, find: (text: string) => T[],
): PlacedLink<T>[] {
  return linksOnLine(buffer, row, widthAt, find).filter((link) => link.start.row === row);
}

// Every link a pointer on this row could be over, so any part of a wrapped path underlines and opens
// the whole of it.
export function linksTouching<T extends LinkSpan>(
  buffer: WrapBuffer, row: number, widthAt: WidthAt, find: (text: string) => T[],
): PlacedLink<T>[] {
  return linksOnLine(buffer, row, widthAt, find).filter((link) => link.start.row <= row && link.end.row >= row);
}
