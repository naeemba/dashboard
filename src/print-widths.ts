// How wide the pane was when a row was printed. A program such as Claude Code cuts its output to the
// width it sees, and keeps those rows when the pane is later zoomed or resized, so a row is measured
// against the width in effect when it was printed, not the one now.
export type WidthAt = (row: number) => number;

export type PrintWidths = {
  // Call on every resize: `lineCount` is the buffer's length and `cols` the width it was before.
  resized(lineCount: number, cols: number): void;
  at: WidthAt;
};

// ponytail: rows are placed by the buffer's length at the resize, which xterm's reflow of wrapped rows
// can shift by a few lines; upgrade to marking the line (`registerMarker`) if that ever mis-measures.
export function printWidths(currentCols: () => number): PrintWidths {
  const changes: { lineCount: number; cols: number }[] = [];
  return {
    resized: (lineCount, cols) => { changes.push({ lineCount, cols }); },
    // The first resize after the row was printed holds the width the row had until then.
    at: (row) => changes.find((change) => change.lineCount > row)?.cols ?? currentCols(),
  };
}
