import { describe, expect, it } from 'vitest';
import { pressureFactor, strokeHit, strokeOutline, type InkPoint, type Stroke } from './ink-geometry';

const point = (x: number, y: number, pressure = 0.5): InkPoint => ({ x, y, pressure });

describe('pressureFactor', () => {
  it('is exactly one at the pressure a mouse is given, so a mouse draws the nominal width', () => {
    expect(pressureFactor(0.5)).toBeCloseTo(1);
  });

  it('runs from a fine line to a bold one', () => {
    expect(pressureFactor(0)).toBeCloseTo(0.4);
    expect(pressureFactor(1)).toBeCloseTo(1.6);
  });
});

describe('strokeOutline', () => {
  it('is nothing for no points', () => {
    expect(strokeOutline([], 4)).toBe('');
  });

  it('is a dot for one point, as wide as the stroke', () => {
    expect(strokeOutline([point(10, 10)], 4)).toBe('M8,10a2,2 0 1,0 4,0a2,2 0 1,0 -4,0Z');
  });

  it('pushes a horizontal stroke half a width up and down', () => {
    expect(strokeOutline([point(0, 10), point(10, 10)], 4)).toBe('M0,12L10,12L10,8L0,8Z');
  });

  it('is thicker where the pen pressed harder', () => {
    // Half of 10 × 0.4 at the start, half of 10 × 1.6 at the end.
    expect(strokeOutline([point(0, 10, 0), point(10, 10, 1)], 10)).toBe('M0,12L10,18L10,2L0,8Z');
  });

  it('survives a repeated point without writing NaN', () => {
    expect(strokeOutline([point(0, 0), point(0, 0), point(10, 0)], 4)).not.toContain('NaN');
  });
});

describe('strokeHit', () => {
  const line: Stroke = { color: 'currentColor', width: 4, points: [point(0, 0), point(100, 0)] };

  it('hits within the radius plus half the width of a segment', () => {
    expect(strokeHit(line, 50, 10, 8)).toBe(true);
    expect(strokeHit(line, 50, 11, 8)).toBe(false);
  });

  it('measures to the nearest end beyond a segment', () => {
    expect(strokeHit(line, 109, 0, 8)).toBe(true);
    expect(strokeHit(line, 111, 0, 8)).toBe(false);
  });

  it('hits a dot, and a stroke with no points never', () => {
    const dot: Stroke = { color: 'currentColor', width: 4, points: [point(5, 5)] };
    expect(strokeHit(dot, 5, 14, 8)).toBe(true);
    expect(strokeHit(dot, 5, 16, 8)).toBe(false);
    expect(strokeHit({ ...dot, points: [] }, 5, 5, 8)).toBe(false);
  });
});
