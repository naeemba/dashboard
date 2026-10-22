// How wide the pane was when a row was printed. A program such as Claude Code cuts its output to the
// width it sees, and keeps those rows when the pane is later zoomed or resized, so a row is measured
// against the width in effect when it was printed, not the one now.
export type WidthAt = (row: number) => number;

// The part of xterm's marker this needs: its line follows the row through scrollback trimming, and it is
// disposed when that row is trimmed away.
export type LineMarker = { line: number; isDisposed: boolean };

export type PrintWidths = {
  // Call on every resize: `marker` is the cursor's line, where output printed after the resize starts,
  // and `cols` the width the pane had until then.
  resized(marker: LineMarker, cols: number): void;
  // Call when the buffer is emptied: the rows the boundaries pointed at are gone.
  reset(): void;
  at: WidthAt;
};

export function printWidths(currentCols: () => number): PrintWidths {
  let changes: { marker: LineMarker; cols: number }[] = [];
  return {
    resized: (marker, cols) => { changes.push({ marker, cols }); },
    reset: () => { changes = []; },
    // The first resize after the row was printed holds the width the row had until then. A trimmed
    // boundary is skipped: every row before it is gone too.
    at: (row) => changes.find(({ marker }) => !marker.isDisposed && marker.line > row)?.cols ?? currentCols(),
  };
}
