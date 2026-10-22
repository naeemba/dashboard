import type { IMarker } from '@xterm/xterm';

// How wide the pane was when a row was printed. A program such as Claude Code cuts its output to the
// width it sees, and keeps those rows when the pane is later zoomed or resized, so a row is measured
// against the width in effect when it was printed, not the one now.
export type WidthAt = (row: number) => number;

// The part of xterm's marker this needs: its line follows the row through scrollback trimming, and it is
// disposed when that row is trimmed away.
export type LineMarker = Pick<IMarker, 'line' | 'isDisposed'>;

export type PrintWidths = {
  // Call on every resize, and when the normal buffer comes back: records the width the pane had until now.
  resized(): void;
  // Call when the program erases a row, with its line in the buffer: a program that redraws a live frame
  // erases it from its top and writes its next output there, above the cursor, so a boundary below that
  // line moves up to it.
  rowErased(line: number): void;
  // Call when the buffer is emptied: the rows the boundaries pointed at are gone.
  reset(): void;
  at: WidthAt;
};

type Boundary = { marker: LineMarker; cols: number };

type PrintWidthsSource = {
  cols: () => number;
  // The cursor's line, where output printed from now on starts.
  mark: () => LineMarker;
  // The alternate screen is redrawn by its program at every resize, and its markers die when it closes.
  isNormalBuffer: () => boolean;
};

export function printWidths({ cols, mark, isNormalBuffer }: PrintWidthsSource): PrintWidths {
  let boundaries: Boundary[] = [];
  let lastCols = cols();
  return {
    resized: () => {
      if (!isNormalBuffer() || cols() === lastCols) return;
      boundaries.push({ marker: mark(), cols: lastCols });
      lastCols = cols();
    },
    rowErased: (line) => {
      const latest = boundaries.at(-1);
      if (!isNormalBuffer() || !latest || line >= latest.marker.line) return;
      // The rows above the new line were printed at the width of the first boundary at or below it.
      const below = boundaries.find(({ marker }) => !marker.isDisposed && marker.line >= line);
      if (!below) return;
      // Older boundaries at or below the new line would shadow it: `at` takes the first match.
      boundaries = [...boundaries.filter(({ marker }) => marker.line < line), { marker: mark(), cols: below.cols }];
    },
    reset: () => { boundaries = []; },
    // The first resize after the row was printed holds the width the row had until then. A trimmed
    // boundary is skipped: every row before it is gone too.
    at: (row) => (isNormalBuffer() ? boundaries.find(({ marker }) => !marker.isDisposed && marker.line > row)?.cols : undefined) ?? cols(),
  };
}
