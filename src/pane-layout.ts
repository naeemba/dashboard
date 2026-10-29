import { clampIndex } from './clamp-index';
import { MAIN_INDEX, isWorker, type Direction } from './terminals';

// Where the keyboard goes among a project's terminals: the main session in a column of its own on the
// left, the workers in a list down the right. Every answer is asked of `open`, the indices of the panes
// the project has right now in the order they are drawn — ascending, so main is first — because a
// worker's number says which pane it is and nothing about where it sits once others have closed.

// The pane a numbered focus key lands on: the first is main, the rest count down the worker list.
// Undefined past the end, so a key for a worker that is not there does nothing.
export function paneAtPosition(open: readonly number[], position: number): number | undefined {
  return open[position];
}

// Next and previous, round the end. A pane that has gone is counted from the top.
export function stepPane(open: readonly number[], current: number, step: 1 | -1): number {
  if (open.length === 0) return current;
  const at = Math.max(open.indexOf(current), 0);
  return open[(at + step + open.length) % open.length];
}

// The vim directions. Left and right cross between main and the list, up and down walk the list and
// stop at its ends. From main, right is the top worker: the list may be scrolled anywhere, and the top
// is the one place that is the same answer every time.
export function neighborPane(open: readonly number[], current: number, direction: Direction): number {
  const workers = open.filter(isWorker);
  if (current === MAIN_INDEX) return direction === 'right' ? workers[0] ?? current : current;
  if (direction === 'left') return open.includes(MAIN_INDEX) ? MAIN_INDEX : current;
  const at = workers.indexOf(current);
  if (direction === 'right' || at === -1) return current;
  const next = at + (direction === 'down' ? 1 : -1);
  return workers[clampIndex(next, workers.length - 1)];
}

// The number a new worker gets: the lowest one no open pane holds, so a list that has had workers come
// and go still reads terminal 2, 3, 4 rather than climbing for the life of the project.
export function nextPaneIndex(open: readonly number[]): number {
  let index = MAIN_INDEX + 1;
  while (open.includes(index)) index++;
  return index;
}
