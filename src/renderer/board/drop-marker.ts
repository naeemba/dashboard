import { dropRow } from './board-drag';

export type DropMarker = {
  clear(): void;
  markSoon(list: HTMLElement, pointerY: number): void;
  rowUnder(list: HTMLElement, pointerY: number): number;
};

// The line a drag draws between two cards, and the measuring both it and the drop read. DOM only:
// which gap a pointer names is decided in board-drag.ts, where a test can reach it.
export function createDropMarker(): DropMarker {
  // The card carrying the line that says where a dragged card would land, and the frame that will draw
  // it. Held rather than searched for: a dragover fires on every mouse movement, and looking the marked
  // card up by its own class each time walks every node on the board — on the manager that is every
  // open project's cards at once — to find the one node this file put the class on itself.
  let marked: Element | null = null;
  let markFrame = 0;

  // Takes the line off whatever is carrying it, and calls off a frame that has not drawn yet — without
  // that, a drag let go of or abandoned a few milliseconds after the last dragover leaves a line on the
  // board pointing at a gap nothing is being dropped into.
  function clear(): void {
    cancelAnimationFrame(markFrame);
    markFrame = 0;
    marked?.classList.remove('drop-above', 'drop-below');
    marked = null;
  }

  // Where the card would land if you let go now, drawn as a line along the top of the card it would sit
  // above — or along the bottom of the last one when the answer is the end of the column. Without it a
  // drag into a column of a dozen cards is a guess: the gap between two cards is four pixels of
  // background and nothing in it says which gap the cursor is in.
  //
  // An empty column gets no line. There is one place the card can go and the column is visibly empty,
  // so there is nothing for a line to tell apart.
  //
  // One frame at a time. A dragover fires on every mouse movement and again every few hundred
  // milliseconds while the cursor sits still, and reading a column's rows reads the box of every card
  // in it — a whole layout each time, forced again by the class this then writes. The line can only be
  // painted once a frame, so measuring more often than that buys a stutter and nothing else.
  function markSoon(list: HTMLElement, pointerY: number): void {
    if (markFrame) return;
    markFrame = requestAnimationFrame(() => {
      markFrame = 0;
      clear();
      const cards = list.children;
      const row = rowUnder(list, pointerY);
      // The end of the column is the one landing with no card above it to draw on, so the last card
      // carries the line under itself instead.
      const above = row < cards.length;
      marked = (above ? cards[row] : cards[cards.length - 1]) ?? null;
      marked?.classList.add(above ? 'drop-above' : 'drop-below');
    });
  }

  // Which row of this column the pointer is naming. Measured here and decided in board-drag.ts, so the
  // rule about which gap a pointer is in is somewhere a test can reach — and asked in one place, so the
  // line you were shown and the row you get cannot be two different answers.
  function rowUnder(list: HTMLElement, pointerY: number): number {
    const midpoints = [...list.children].map((item) => {
      const box = item.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    return dropRow(midpoints, pointerY);
  }

  return { clear, markSoon, rowUnder };
}
