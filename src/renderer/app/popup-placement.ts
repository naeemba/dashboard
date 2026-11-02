// Where a popup opened from something low on the screen sits: just above it, lined up with whichever
// edge of it faces the middle of the window. One opened from the left of the Claude screen's foot, the
// workers count, grows rightwards from its left edge; one opened from the right, the context meter,
// grows leftwards from its right edge; neither runs off the window. In pixels, from the window's edges.
export type Placement = { bottom: number; left: number | null; right: number | null; maxHeight: number };

export const POPUP_GAP = 6;

export function placeAbove(anchor: { left: number; right: number; top: number }, window: { width: number; height: number }): Placement {
  const bottom = window.height - anchor.top + POPUP_GAP;
  const maxHeight = Math.max(0, anchor.top - 2 * POPUP_GAP);
  const onRight = anchor.left + anchor.right > window.width;
  return onRight
    ? { bottom, left: null, right: Math.max(POPUP_GAP, window.width - anchor.right), maxHeight }
    : { bottom, left: Math.max(POPUP_GAP, anchor.left), right: null, maxHeight };
}
