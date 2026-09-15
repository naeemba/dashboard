// Which row a pointer names in a column: the row the dragged card would sit above, counted in the
// column as it looks now. `dropCard` in board.ts takes it from here.
//
// A card is claimed from its middle downwards, so the bottom half of the last card is how you put
// something at the end. Without that, a full column has no empty space left under it to aim at, and
// the last row is the one row a drag could never reach — you would drop a card meaning to put it
// last and watch it land second to last, every time.
//
// It takes the midpoints rather than the cards, because the answer is arithmetic on numbers and
// numbers are what a test can hand it. The view measures; this decides.
export function dropRow(midpoints: readonly number[], pointerY: number): number {
  const above = midpoints.findIndex((midpoint) => pointerY < midpoint);
  return above === -1 ? midpoints.length : above;
}
