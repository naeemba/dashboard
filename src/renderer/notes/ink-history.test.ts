import { describe, expect, it } from 'vitest';
import { addStroke, clearAll, eraseStrokes, readInto, startHistory, undo } from './ink-history';
import type { Stroke } from './ink-geometry';

const stroke = (x: number): Stroke => ({ color: 'currentColor', width: 2, points: [{ x, y: 0, pressure: 0.5 }] });

describe('the ink history', () => {
  it('adds a stroke and undoes it', () => {
    const added = addStroke(startHistory(), stroke(1));
    expect(added.strokes).toEqual([stroke(1)]);
    expect(undo(added).strokes).toEqual([]);
  });

  it('erases several strokes as one step', () => {
    const three = [stroke(1), stroke(2), stroke(3)].reduce(addStroke, startHistory());
    const erased = eraseStrokes(three, [0, 2]);
    expect(erased.strokes).toEqual([stroke(2)]);
    expect(undo(erased).strokes).toEqual([stroke(1), stroke(2), stroke(3)]);
  });

  it('answers the same history when an erase crossed nothing', () => {
    const one = addStroke(startHistory(), stroke(1));
    expect(eraseStrokes(one, [])).toBe(one);
    expect(eraseStrokes(one, [5, -1])).toBe(one);
  });

  it('clears the page, and undo brings it back', () => {
    const two = [stroke(1), stroke(2)].reduce(addStroke, startHistory());
    const cleared = clearAll(two);
    expect(cleared.strokes).toEqual([]);
    expect(undo(cleared).strokes).toEqual(two.strokes);
  });

  it('does nothing to clear an empty page or undo with nothing before it', () => {
    const empty = startHistory();
    expect(clearAll(empty)).toBe(empty);
    expect(undo(empty)).toBe(empty);
  });

  it('starts a read page with nothing to undo', () => {
    expect(undo(startHistory([stroke(1)])).strokes).toEqual([stroke(1)]);
  });

  it('keeps the undo steps when a read brings back the page already showing', () => {
    const cleared = clearAll(addStroke(startHistory(), stroke(1)));
    expect(readInto(cleared, [])).toBe(cleared);
    expect(undo(readInto(cleared, [])).strokes).toEqual([stroke(1)]);
  });

  it('starts the undo steps again when a read brings back a different page', () => {
    const one = addStroke(startHistory(), stroke(1));
    expect(readInto(one, [stroke(2)])).toEqual({ strokes: [stroke(2)], past: [] });
  });

  it('does not change the history it was given', () => {
    const one = addStroke(startHistory(), stroke(1));
    const before = JSON.stringify(one);
    addStroke(one, stroke(2));
    eraseStrokes(one, [0]);
    clearAll(one);
    undo(one);
    expect(JSON.stringify(one)).toBe(before);
  });
});
